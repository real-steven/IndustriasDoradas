-- Sprint 4.11: feed operacional completo por planta.
-- El oro permanece exclusivamente en web/API y nunca entra al pull de desktop.

alter table app.sync_changes drop constraint sync_changes_entity_type_check;
alter table app.sync_changes add constraint sync_changes_entity_type_check check (
  entity_type in (
    'SUPPLIER', 'WORKER', 'PRODUCTION_LINE', 'LINE_COMPONENT',
    'STATION', 'STATION_LINE_SCOPE', 'SHIPMENT',
    'RESPONSIBILITY_ASSIGNMENT', 'PRODUCTION_EVENT',
    'PRODUCTION_SWEEP', 'MERCURY_MOVEMENT', 'ADMINISTRATIVE_CORRECTION'
  )
);

create function app.append_plant_sync_change_v1(
  entity_type_value text,
  entity_id_value uuid,
  organization_id_value uuid,
  plant_id_value uuid,
  payload_value jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  sequence_value bigint := nextval('app.sync_changes_server_sequence_seq');
begin
  insert into app.sync_changes (
    change_id, server_sequence, organization_id, plant_id, station_id,
    entity_type, entity_id, entity_version, action, changed_at_utc,
    payload_schema_version, payload
  ) values (
    gen_random_uuid(), sequence_value, organization_id_value, plant_id_value, null,
    entity_type_value, entity_id_value, sequence_value, 'UPSERT', now(), 1, payload_value
  );
end;
$$;

revoke all on function app.append_plant_sync_change_v1(text, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function app.append_plant_sync_change_v1(text, uuid, uuid, uuid, jsonb)
  to service_role;

create function app.capture_plant_operational_sync_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  entity_type_value text;
  plant_id_value uuid;
begin
  case tg_table_name
    when 'shipments' then
      entity_type_value := 'SHIPMENT';
      plant_id_value := new.plant_id;
    when 'responsibility_assignments' then
      entity_type_value := 'RESPONSIBILITY_ASSIGNMENT';
      select shipment.plant_id into plant_id_value
      from app.shipments as shipment
      where shipment.organization_id = new.organization_id
        and shipment.id = new.shipment_id;
    when 'production_events' then
      entity_type_value := 'PRODUCTION_EVENT';
      plant_id_value := new.plant_id;
    when 'mercury_movements' then
      entity_type_value := 'MERCURY_MOVEMENT';
      plant_id_value := new.plant_id;
    else
      raise exception using errcode = '23514', message = 'unsupported plant sync source';
  end case;

  perform app.append_plant_sync_change_v1(
    entity_type_value, new.id, new.organization_id, plant_id_value, to_jsonb(new)
  );
  return new;
end;
$$;

revoke all on function app.capture_plant_operational_sync_change_v1()
  from public, anon, authenticated;

drop trigger trg_shipments_sync_change on app.shipments;
drop trigger trg_responsibility_assignments_sync_change on app.responsibility_assignments;

create trigger trg_shipments_plant_sync_change
after insert or update on app.shipments
for each row execute function app.capture_plant_operational_sync_change_v1();
create trigger trg_responsibility_assignments_plant_sync_change
after insert or update on app.responsibility_assignments
for each row execute function app.capture_plant_operational_sync_change_v1();
create trigger trg_production_events_plant_sync_change
after insert on app.production_events
for each row execute function app.capture_plant_operational_sync_change_v1();
create trigger trg_mercury_movements_plant_sync_change
after insert on app.mercury_movements
for each row execute function app.capture_plant_operational_sync_change_v1();

create function app.enqueue_production_sweep_sync_change_v1(
  organization_id_value uuid,
  sweep_id_value uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  sweep_row app.production_sweeps%rowtype;
  event_ids jsonb;
begin
  select * into strict sweep_row
  from app.production_sweeps
  where organization_id = organization_id_value and id = sweep_id_value;

  select coalesce(jsonb_agg(member.production_event_id order by event.client_sequence), '[]'::jsonb)
    into event_ids
  from app.sweep_production_events as member
  join app.production_events as event
    on event.organization_id = member.organization_id
   and event.id = member.production_event_id
  where member.organization_id = organization_id_value
    and member.sweep_id = sweep_id_value;

  perform app.append_plant_sync_change_v1(
    'PRODUCTION_SWEEP', sweep_row.id, sweep_row.organization_id, sweep_row.plant_id,
    to_jsonb(sweep_row) || jsonb_build_object('event_ids', event_ids)
  );
end;
$$;

revoke all on function app.enqueue_production_sweep_sync_change_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function app.enqueue_production_sweep_sync_change_v1(uuid, uuid)
  to service_role;

create function app.ingest_extended_sync_item_v1(input_item jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  existing_receipt app.sync_receipts%rowtype;
  payload_value jsonb := input_item -> 'payload';
  organization_id_value uuid := (input_item ->> 'organizationId')::uuid;
  plant_id_value uuid := (input_item ->> 'plantId')::uuid;
  station_id_value uuid := (input_item ->> 'stationId')::uuid;
  outbox_message_id_value uuid := (input_item ->> 'outboxMessageId')::uuid;
  station_sequence_value bigint := (input_item ->> 'stationSequence')::bigint;
  operation_type_value text := input_item ->> 'operationType';
  aggregate_type_value text := input_item ->> 'aggregateType';
  aggregate_id_value uuid := (input_item ->> 'aggregateId')::uuid;
  actor_profile_id_value uuid := (input_item #>> '{authorization,actorProfileId}')::uuid;
  content_hash_value text := input_item ->> 'contentHash';
  correlation_id_value uuid := (input_item ->> 'correlationId')::uuid;
  receipt_id_value uuid := (input_item ->> 'receiptId')::uuid;
  audit_event_id_value uuid := (input_item ->> 'auditEventId')::uuid;
  processed_at_value timestamptz := (input_item ->> 'processedAtUtc')::timestamptz;
  result_code_value text := nullif(input_item ->> 'precheckCode', '');
  result_status_value text;
  actor_auth_user_id_value uuid;
  actor_display_name_value text;
  actor_role_code_value text;
  event_count integer;
  event_total integer;
  lock_key text;
begin
  lock_key := organization_id_value::text || ':' || station_id_value::text
    || ':' || outbox_message_id_value::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_key, 0));

  select * into existing_receipt
  from app.sync_receipts
  where organization_id = organization_id_value
    and station_id = station_id_value
    and outbox_message_id = outbox_message_id_value;
  if found then
    return jsonb_build_object(
      'outboxMessageId', outbox_message_id_value,
      'stationSequence', station_sequence_value,
      'status', case when existing_receipt.content_hash = content_hash_value
        and existing_receipt.terminal_status = 'APPLIED' then 'ALREADY_APPLIED'
        else 'FAILED_REVIEW' end,
      'receiptId', existing_receipt.id,
      'code', case when existing_receipt.content_hash <> content_hash_value
        then 'IDEMPOTENCY_CONTENT_MISMATCH'
        when existing_receipt.terminal_status = 'APPLIED' then 'ALREADY_APPLIED'
        else existing_receipt.result_code end,
      'processedAtUtc', existing_receipt.processed_at_utc
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id_value::text || ':' || station_id_value::text
      || ':sequence:' || station_sequence_value::text, 0
  ));
  if exists (
    select 1 from app.sync_receipts
    where organization_id = organization_id_value
      and station_id = station_id_value
      and station_sequence = station_sequence_value
  ) then
    return jsonb_build_object(
      'outboxMessageId', outbox_message_id_value,
      'stationSequence', station_sequence_value,
      'status', 'FAILED_REVIEW', 'code', 'STATION_SEQUENCE_CONFLICT',
      'processedAtUtc', processed_at_value
    );
  end if;

  if result_code_value is null
     and input_item #>> '{authorization,stateAtCapture}' <> 'VALID' then
    result_code_value := 'AUTHORIZATION_EXPIRED_CONTINGENCY';
  end if;
  if result_code_value is null then
    result_code_value := app.sync_conflict_code_v1(input_item);
  end if;

  if result_code_value is null then
    begin
      if operation_type_value = 'PRODUCTION_SWEEP_RECORDED' then
        if not exists (
          select 1 from app.shipments
          where organization_id = organization_id_value
            and id = (payload_value ->> 'shipmentId')::uuid
        ) or exists (
          select 1 from jsonb_array_elements_text(payload_value -> 'eventIds') as requested(value)
          where not exists (
            select 1 from app.production_events as event
            where event.organization_id = organization_id_value
              and event.id = requested.value::uuid
          )
        ) then
          return jsonb_build_object(
            'outboxMessageId', outbox_message_id_value,
            'stationSequence', station_sequence_value,
            'status', 'RETRY_LATER', 'code', 'DEPENDENCY_NOT_READY',
            'processedAtUtc', processed_at_value
          );
        elsif not exists (
          select 1 from app.shipments
          where organization_id = organization_id_value
            and id = (payload_value ->> 'shipmentId')::uuid
            and plant_id = plant_id_value and station_id = station_id_value
            and production_line_id = (payload_value ->> 'lineId')::uuid
            and feed_cycle_id = (payload_value ->> 'feedCycleId')::uuid
        ) then
          result_code_value := 'DEPENDENCY_REJECTED';
        else
          select count(*), coalesce(sum(event.quantity_delta), 0)::integer
            into event_count, event_total
          from app.production_events as event
          where event.organization_id = organization_id_value
            and event.shipment_id = (payload_value ->> 'shipmentId')::uuid
            and event.production_line_id = (payload_value ->> 'lineId')::uuid
            and event.feed_cycle_id = (payload_value ->> 'feedCycleId')::uuid
            and event.id in (
              select value::uuid from jsonb_array_elements_text(payload_value -> 'eventIds')
            );
          if event_count <> jsonb_array_length(payload_value -> 'eventIds')
             or event_total <> (payload_value ->> 'cajuelaCount')::integer then
            result_code_value := 'DEPENDENCY_REJECTED';
          else
            insert into app.production_sweeps (
              id, organization_id, plant_id, station_id, production_line_id,
              feed_cycle_id, shipment_id, client_sequence, cajuela_count,
              swept_at_utc, recorded_at_utc, recorded_by_profile_id, is_final, notes
            ) values (
              (payload_value ->> 'sweepId')::uuid, organization_id_value,
              plant_id_value, station_id_value, (payload_value ->> 'lineId')::uuid,
              (payload_value ->> 'feedCycleId')::uuid,
              (payload_value ->> 'shipmentId')::uuid,
              (payload_value ->> 'clientSequence')::bigint,
              (payload_value ->> 'cajuelaCount')::integer,
              (payload_value ->> 'sweptAtUtc')::timestamptz,
              (payload_value ->> 'recordedAtUtc')::timestamptz,
              actor_profile_id_value, (payload_value ->> 'isFinal')::boolean,
              nullif(payload_value ->> 'notes', '')
            );
            insert into app.sweep_production_events (
              organization_id, sweep_id, production_event_id,
              shipment_id, production_line_id, feed_cycle_id
            )
            select organization_id_value, (payload_value ->> 'sweepId')::uuid,
              value::uuid, (payload_value ->> 'shipmentId')::uuid,
              (payload_value ->> 'lineId')::uuid,
              (payload_value ->> 'feedCycleId')::uuid
            from jsonb_array_elements_text(payload_value -> 'eventIds');
            perform app.enqueue_production_sweep_sync_change_v1(
              organization_id_value, (payload_value ->> 'sweepId')::uuid
            );
          end if;
        end if;
      elsif operation_type_value = 'MERCURY_MOVEMENT_RECORDED' then
        if not exists (
          select 1 from app.shipments
          where organization_id = organization_id_value
            and id = (payload_value ->> 'shipmentId')::uuid
        ) or not exists (
          select 1 from app.production_sweeps
          where organization_id = organization_id_value
            and id = (payload_value ->> 'sweepId')::uuid
        ) or not exists (
          select 1 from app.line_components
          where organization_id = organization_id_value
            and id = (payload_value ->> 'lineComponentId')::uuid
        ) or (
          nullif(payload_value ->> 'supersedesMovementId', '') is not null
          and not exists (
            select 1 from app.mercury_movements
            where organization_id = organization_id_value
              and id = (payload_value ->> 'supersedesMovementId')::uuid
          )
        ) then
          return jsonb_build_object(
            'outboxMessageId', outbox_message_id_value,
            'stationSequence', station_sequence_value,
            'status', 'RETRY_LATER', 'code', 'DEPENDENCY_NOT_READY',
            'processedAtUtc', processed_at_value
          );
        end if;
        insert into app.mercury_movements (
          id, organization_id, plant_id, station_id, production_line_id,
          feed_cycle_id, shipment_id, line_component_id, sweep_id,
          client_sequence, movement_kind, amount_grams, unit_code,
          occurred_at_utc, recorded_at_utc, recorded_by_profile_id,
          supersedes_movement_id, notes
        ) values (
          (payload_value ->> 'movementId')::uuid, organization_id_value,
          plant_id_value, station_id_value, (payload_value ->> 'lineId')::uuid,
          (payload_value ->> 'feedCycleId')::uuid,
          (payload_value ->> 'shipmentId')::uuid,
          (payload_value ->> 'lineComponentId')::uuid,
          nullif(payload_value ->> 'sweepId', '')::uuid,
          (payload_value ->> 'clientSequence')::bigint,
          payload_value ->> 'movementKind',
          nullif(payload_value ->> 'amountGrams', '')::numeric,
          payload_value ->> 'unitCode',
          (payload_value ->> 'occurredAtUtc')::timestamptz,
          (payload_value ->> 'recordedAtUtc')::timestamptz,
          actor_profile_id_value,
          nullif(payload_value ->> 'supersedesMovementId', '')::uuid,
          nullif(payload_value ->> 'notes', '')
        );
      else
        result_code_value := 'INVALID_EVENT';
      end if;
    exception when integrity_constraint_violation or data_exception then
      result_code_value := 'DEPENDENCY_REJECTED';
    end;
  end if;

  result_status_value := case when result_code_value is null then 'APPLIED'
    else 'FAILED_REVIEW' end;
  result_code_value := coalesce(result_code_value, 'APPLIED');

  insert into app.sync_receipts (
    id, organization_id, plant_id, station_id, outbox_message_id,
    station_sequence, content_hash, operation_type, aggregate_type,
    aggregate_id, terminal_status, result_code, processed_at_utc, correlation_id
  ) values (
    receipt_id_value, organization_id_value, plant_id_value, station_id_value,
    outbox_message_id_value, station_sequence_value, content_hash_value,
    operation_type_value, aggregate_type_value, aggregate_id_value,
    result_status_value, result_code_value, processed_at_value, correlation_id_value
  );

  select profile.auth_user_id, profile.display_name, role.code
    into actor_auth_user_id_value, actor_display_name_value, actor_role_code_value
  from app.user_profiles as profile
  join app.roles as role on role.id = profile.role_id
  where profile.organization_id = organization_id_value
    and profile.id = actor_profile_id_value;

  insert into app.audit_events (
    id, organization_id, station_id, actor_kind, actor_profile_id,
    actor_auth_user_id, actor_display_name, actor_role_code, origin, action,
    entity_type, entity_id, occurred_at, correlation_id, result, reason_code,
    evidence_state, changed_fields, changes, request_method, request_path
  ) values (
    audit_event_id_value, organization_id_value, station_id_value,
    'AUTHENTICATED_USER', actor_profile_id_value, actor_auth_user_id_value,
    actor_display_name_value, actor_role_code_value, 'SYNC', 'sync.ingest',
    aggregate_type_value, aggregate_id_value, processed_at_value,
    correlation_id_value,
    case when result_status_value = 'APPLIED' then 'SUCCEEDED'::app.audit_result
      else 'REJECTED'::app.audit_result end,
    case when result_status_value = 'APPLIED' then null else result_code_value end,
    'NOT_APPLICABLE', '{}'::text[], '{}'::jsonb, 'POST',
    '/api/v1/organizations/{organizationId}/stations/{stationId}/sync/push'
  );

  return jsonb_build_object(
    'outboxMessageId', outbox_message_id_value,
    'stationSequence', station_sequence_value,
    'status', result_status_value, 'receiptId', receipt_id_value,
    'code', result_code_value, 'processedAtUtc', processed_at_value
  );
end;
$$;

revoke all on function app.ingest_extended_sync_item_v1(jsonb)
  from public, anon, authenticated;
grant execute on function app.ingest_extended_sync_item_v1(jsonb) to service_role;

-- Publica instantaneas actuales en orden de dependencia para estaciones que ya
-- habian avanzado su cursor antes de este sprint.
do $$
declare item record;
begin
  for item in select * from app.shipments order by started_at_utc, id loop
    perform app.append_plant_sync_change_v1(
      'SHIPMENT', item.id, item.organization_id, item.plant_id, to_jsonb(item));
  end loop;
  for item in
    select assignment.*, shipment.plant_id
    from app.responsibility_assignments assignment
    join app.shipments shipment
      on shipment.organization_id = assignment.organization_id
     and shipment.id = assignment.shipment_id
    order by assignment.started_at_utc, assignment.id
  loop
    perform app.append_plant_sync_change_v1(
      'RESPONSIBILITY_ASSIGNMENT', item.id, item.organization_id,
      item.plant_id, to_jsonb(item) - 'plant_id');
  end loop;
  for item in select * from app.production_events order by recorded_at_utc, id loop
    perform app.append_plant_sync_change_v1(
      'PRODUCTION_EVENT', item.id, item.organization_id, item.plant_id, to_jsonb(item));
  end loop;
  for item in select * from app.production_sweeps order by recorded_at_utc, id loop
    perform app.enqueue_production_sweep_sync_change_v1(item.organization_id, item.id);
  end loop;
  for item in select * from app.mercury_movements order by recorded_at_utc, id loop
    perform app.append_plant_sync_change_v1(
      'MERCURY_MOVEMENT', item.id, item.organization_id, item.plant_id, to_jsonb(item));
  end loop;
end;
$$;

comment on function app.ingest_extended_sync_item_v1(jsonb) is
  'Ingiere barridas y mercurio de desktop con recibo idempotente y feed por planta.';
