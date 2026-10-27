-- Sprint 7.7: inventario local-first, convergencia e idempotencia entre estaciones.
-- El kardex central decide por orden de llegada; un saldo insuficiente se conserva
-- como recibo FAILED_REVIEW y nunca elimina el hecho que permanece en la estación.

insert into app.role_permissions (role_id, permission_id)
select role.id, permission.id
from app.roles as role
join app.permissions as permission on permission.code = 'inventory.manage'
where role.code in ('JEFE_EMPRESA', 'JEFE_PLANTA')
on conflict (role_id, permission_id) do nothing;

alter table app.sync_changes drop constraint sync_changes_entity_type_check;
alter table app.sync_changes add constraint sync_changes_entity_type_check check (
  entity_type in (
    'SUPPLIER', 'WORKER', 'PRODUCTION_LINE', 'LINE_COMPONENT',
    'STATION', 'STATION_LINE_SCOPE', 'SHIPMENT',
    'RESPONSIBILITY_ASSIGNMENT', 'PRODUCTION_EVENT',
    'PRODUCTION_SWEEP', 'MERCURY_MOVEMENT', 'ADMINISTRATIVE_CORRECTION',
    'ATTENDANCE_EVENT', 'INVENTORY_ITEM_TYPE', 'INVENTORY_UNIT',
    'INVENTORY_ITEM', 'INVENTORY_MOVEMENT', 'INVENTORY_REVIEW'
  )
);

create function app.capture_inventory_sync_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  entity_type_value text;
  entity_id_value uuid;
  plant_id_value uuid;
  payload_value jsonb;
  action_value text;
  sequence_value bigint := nextval('app.sync_changes_server_sequence_seq');
begin
  case tg_table_name
    when 'inventory_item_types' then
      entity_type_value := 'INVENTORY_ITEM_TYPE';
      entity_id_value := new.id;
      plant_id_value := null;
      payload_value := to_jsonb(new);
      action_value := case when new.is_active then 'UPSERT' else 'DEACTIVATE' end;
    when 'inventory_units' then
      entity_type_value := 'INVENTORY_UNIT';
      entity_id_value := new.id;
      plant_id_value := null;
      payload_value := to_jsonb(new);
      action_value := case when new.is_active then 'UPSERT' else 'DEACTIVATE' end;
    when 'inventory_items' then
      entity_type_value := 'INVENTORY_ITEM';
      entity_id_value := new.id;
      plant_id_value := new.plant_id;
      payload_value := to_jsonb(new);
      action_value := case when new.is_active then 'UPSERT' else 'DEACTIVATE' end;
    when 'inventory_movements' then
      entity_type_value := 'INVENTORY_MOVEMENT';
      entity_id_value := new.id;
      plant_id_value := new.plant_id;
      payload_value := to_jsonb(new);
      action_value := 'UPSERT';
    when 'inventory_review_lines' then
      entity_type_value := 'INVENTORY_REVIEW';
      entity_id_value := new.review_id;
      plant_id_value := new.plant_id;
      select to_jsonb(review) || jsonb_build_object('lines', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'inventory_item_id', line.inventory_item_id,
          'unit_id', line.unit_id,
          'expected_quantity', line.expected_quantity,
          'counted_quantity', line.counted_quantity,
          'difference_quantity', line.difference_quantity
        ) order by line.inventory_item_id), '[]'::jsonb)
        from app.inventory_review_lines as line
        where line.organization_id = review.organization_id
          and line.review_id = review.id
      )) into payload_value
      from app.inventory_reviews as review
      where review.organization_id = new.organization_id
        and review.id = new.review_id;
      action_value := 'UPSERT';
    else
      raise exception using errcode = '23514', message = 'UNSUPPORTED_INVENTORY_SYNC_SOURCE';
  end case;

  insert into app.sync_changes (
    change_id, server_sequence, organization_id, plant_id, station_id,
    entity_type, entity_id, entity_version, action, changed_at_utc,
    payload_schema_version, payload
  ) values (
    gen_random_uuid(), sequence_value, new.organization_id, plant_id_value, null,
    entity_type_value, entity_id_value,
    sequence_value,
    action_value,
    now(), 1, payload_value
  );
  return new;
end;
$$;

revoke all on function app.capture_inventory_sync_change_v1()
  from public, anon, authenticated;

create trigger trg_inventory_item_types_sync_change
after insert or update on app.inventory_item_types
for each row execute function app.capture_inventory_sync_change_v1();
create trigger trg_inventory_units_sync_change
after insert or update on app.inventory_units
for each row execute function app.capture_inventory_sync_change_v1();
create trigger trg_inventory_items_sync_change
after insert or update on app.inventory_items
for each row execute function app.capture_inventory_sync_change_v1();
create trigger trg_inventory_movements_sync_change
after insert on app.inventory_movements
for each row execute function app.capture_inventory_sync_change_v1();
create trigger trg_inventory_review_lines_sync_change
after insert on app.inventory_review_lines
for each row execute function app.capture_inventory_sync_change_v1();

create function app.ingest_inventory_sync_item_v1(input_item jsonb)
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
  sent_at_value timestamptz := coalesce(
    nullif(input_item ->> 'clientSentAtUtc', '')::timestamptz, processed_at_value);
  result_code_value text := nullif(input_item ->> 'precheckCode', '');
  result_status_value text;
  actor_auth_user_id_value uuid;
  actor_display_name_value text;
  actor_role_code_value text;
  error_message_value text;
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
      || ':sequence:' || station_sequence_value::text, 0));
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

  insert into app.sync_clients (
    station_id, organization_id, plant_id, application, application_version,
    last_batch_id, last_sent_at_utc, first_seen_at_utc, last_seen_at_utc,
    last_clock_skew_seconds
  ) values (
    station_id_value, organization_id_value, plant_id_value,
    coalesce(nullif(input_item ->> 'clientApplication', ''), 'desktop'),
    coalesce(nullif(input_item ->> 'clientApplicationVersion', ''), 'legacy'),
    coalesce(nullif(input_item ->> 'batchId', '')::uuid, outbox_message_id_value),
    sent_at_value, processed_at_value, processed_at_value,
    round(extract(epoch from processed_at_value - sent_at_value))::bigint
  ) on conflict (station_id) do update set
    application = excluded.application,
    application_version = excluded.application_version,
    last_batch_id = excluded.last_batch_id,
    last_sent_at_utc = excluded.last_sent_at_utc,
    last_seen_at_utc = excluded.last_seen_at_utc,
    last_clock_skew_seconds = excluded.last_clock_skew_seconds;

  if result_code_value is null
     and input_item #>> '{authorization,stateAtCapture}' <> 'VALID' then
    result_code_value := 'AUTHORIZATION_EXPIRED_CONTINGENCY';
  end if;
  if result_code_value is null then
    result_code_value := app.sync_conflict_code_v1(input_item);
  end if;
  if result_code_value is null and not exists (
    select 1
    from app.user_profiles as profile
    join app.role_permissions as role_permission on role_permission.role_id = profile.role_id
    join app.permissions as permission on permission.id = role_permission.permission_id
    where profile.organization_id = organization_id_value
      and profile.id = actor_profile_id_value and profile.is_active
      and permission.code = 'inventory.manage' and permission.is_active
  ) then
    result_code_value := 'PERMISSION_DENIED';
  end if;

  if result_code_value is null and operation_type_value = 'INVENTORY_MOVEMENT_RECORDED' then
    if not exists (
      select 1 from app.inventory_items
      where organization_id = organization_id_value and plant_id = plant_id_value
        and id = (payload_value ->> 'inventoryItemId')::uuid
    ) or not exists (
      select 1 from app.inventory_units
      where organization_id = organization_id_value
        and id = (payload_value ->> 'unitId')::uuid
    ) or (
      nullif(payload_value ->> 'responsibleWorkerId', '') is not null and not exists (
        select 1 from app.workers where organization_id = organization_id_value
          and id = (payload_value ->> 'responsibleWorkerId')::uuid
      )
    ) or (
      nullif(payload_value ->> 'relatedMovementId', '') is not null and not exists (
        select 1 from app.inventory_movements where organization_id = organization_id_value
          and id = (payload_value ->> 'relatedMovementId')::uuid
      )
    ) then
      return jsonb_build_object(
        'outboxMessageId', outbox_message_id_value,
        'stationSequence', station_sequence_value,
        'status', 'RETRY_LATER', 'code', 'DEPENDENCY_NOT_READY',
        'processedAtUtc', processed_at_value
      );
    end if;
  elsif result_code_value is null and operation_type_value = 'INVENTORY_REVIEW_RECORDED' then
    if exists (
      select 1 from jsonb_array_elements(payload_value -> 'lines') as requested(line)
      where not exists (
        select 1 from app.inventory_items as item
        where item.organization_id = organization_id_value
          and item.plant_id = plant_id_value
          and item.id = (requested.line ->> 'inventoryItemId')::uuid
          and item.unit_id = (requested.line ->> 'unitId')::uuid
      )
    ) then
      return jsonb_build_object(
        'outboxMessageId', outbox_message_id_value,
        'stationSequence', station_sequence_value,
        'status', 'RETRY_LATER', 'code', 'DEPENDENCY_NOT_READY',
        'processedAtUtc', processed_at_value
      );
    end if;
  end if;

  if result_code_value is null then
    begin
      if operation_type_value = 'INVENTORY_MOVEMENT_RECORDED'
         and aggregate_type_value = 'inventory_movement' then
        insert into app.inventory_movements (
          id, organization_id, plant_id, inventory_item_id, unit_id,
          movement_type, quantity_delta, actor_profile_id, station_id,
          client_sequence, responsible_worker_id, occurred_at_utc,
          recorded_at_utc, reason, destination, notes, related_movement_id
        ) values (
          aggregate_id_value, organization_id_value, plant_id_value,
          (payload_value ->> 'inventoryItemId')::uuid,
          (payload_value ->> 'unitId')::uuid, payload_value ->> 'movementType',
          (payload_value ->> 'quantityDelta')::numeric,
          actor_profile_id_value, station_id_value, station_sequence_value,
          nullif(payload_value ->> 'responsibleWorkerId', '')::uuid,
          (payload_value ->> 'occurredAtUtc')::timestamptz,
          (payload_value ->> 'recordedAtUtc')::timestamptz,
          nullif(payload_value ->> 'reason', ''),
          nullif(payload_value ->> 'destination', ''),
          nullif(payload_value ->> 'notes', ''),
          nullif(payload_value ->> 'relatedMovementId', '')::uuid
        );
      elsif operation_type_value = 'INVENTORY_REVIEW_RECORDED'
            and aggregate_type_value = 'inventory_review' then
        insert into app.inventory_reviews (
          id, organization_id, plant_id, status, reviewed_by_profile_id,
          station_id, client_sequence, reviewed_at_utc, recorded_at_utc, notes
        ) values (
          aggregate_id_value, organization_id_value, plant_id_value,
          payload_value ->> 'status', actor_profile_id_value, station_id_value,
          station_sequence_value,
          (payload_value ->> 'reviewedAtUtc')::timestamptz,
          (payload_value ->> 'recordedAtUtc')::timestamptz,
          nullif(payload_value ->> 'notes', '')
        );
        insert into app.inventory_review_lines (
          organization_id, plant_id, review_id, inventory_item_id, unit_id,
          expected_quantity, counted_quantity, difference_quantity
        ) select organization_id_value, plant_id_value, aggregate_id_value,
          (line ->> 'inventoryItemId')::uuid, (line ->> 'unitId')::uuid,
          (line ->> 'expectedQuantity')::numeric,
          (line ->> 'countedQuantity')::numeric,
          (line ->> 'differenceQuantity')::numeric
        from jsonb_array_elements(payload_value -> 'lines') as line;
      else
        result_code_value := 'INVALID_EVENT';
      end if;
    exception when integrity_constraint_violation or data_exception then
      get stacked diagnostics error_message_value = message_text;
      result_code_value := case error_message_value
        when 'INVENTORY_STOCK_INSUFFICIENT' then 'INVENTORY_STOCK_INSUFFICIENT'
        else 'DEPENDENCY_REJECTED' end;
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
    actor_display_name_value, actor_role_code_value, 'SYNC', 'inventory.manage',
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

revoke all on function app.ingest_inventory_sync_item_v1(jsonb)
  from public, anon, authenticated;
grant execute on function app.ingest_inventory_sync_item_v1(jsonb) to service_role;

-- Publica el catálogo e historial existentes para estaciones con cursor avanzado.
do $$
declare
  item record;
  sequence_value bigint;
  type_value text;
  plant_value uuid;
  payload_value jsonb;
begin
  for item in
    select 'INVENTORY_ITEM_TYPE'::text as entity_type, value.id, value.organization_id,
      null::uuid as plant_id, to_jsonb(value) as payload, value.is_active, value.created_at
    from app.inventory_item_types as value
    union all
    select 'INVENTORY_UNIT', value.id, value.organization_id, null::uuid,
      to_jsonb(value), value.is_active, value.created_at
    from app.inventory_units as value
    union all
    select 'INVENTORY_ITEM', value.id, value.organization_id, value.plant_id,
      to_jsonb(value), value.is_active, value.created_at
    from app.inventory_items as value
    union all
    select 'INVENTORY_MOVEMENT', value.id, value.organization_id, value.plant_id,
      to_jsonb(value), true, value.created_at
    from app.inventory_movements as value
    order by created_at, id
  loop
    sequence_value := nextval('app.sync_changes_server_sequence_seq');
    insert into app.sync_changes (
      change_id, server_sequence, organization_id, plant_id, station_id,
      entity_type, entity_id, entity_version, action, changed_at_utc,
      payload_schema_version, payload
    ) values (
      gen_random_uuid(), sequence_value, item.organization_id, item.plant_id, null,
      item.entity_type, item.id, sequence_value,
      case when item.is_active then 'UPSERT' else 'DEACTIVATE' end,
      now(), 1, item.payload
    );
  end loop;
  for item in select * from app.inventory_reviews order by created_at, id loop
    select to_jsonb(item) || jsonb_build_object('lines', coalesce(jsonb_agg(
      jsonb_build_object(
        'inventory_item_id', line.inventory_item_id, 'unit_id', line.unit_id,
        'expected_quantity', line.expected_quantity,
        'counted_quantity', line.counted_quantity,
        'difference_quantity', line.difference_quantity
      ) order by line.inventory_item_id), '[]'::jsonb))
      into payload_value
    from app.inventory_review_lines as line
    where line.organization_id = item.organization_id and line.review_id = item.id;
    sequence_value := nextval('app.sync_changes_server_sequence_seq');
    insert into app.sync_changes (
      change_id, server_sequence, organization_id, plant_id, station_id,
      entity_type, entity_id, entity_version, action, changed_at_utc,
      payload_schema_version, payload
    ) values (
      gen_random_uuid(), sequence_value, item.organization_id, item.plant_id, null,
      'INVENTORY_REVIEW', item.id, sequence_value, 'UPSERT', now(), 1, payload_value
    );
  end loop;
end;
$$;

comment on function app.ingest_inventory_sync_item_v1(jsonb) is
  'Ingiere inventario offline con recibo idempotente y rechazo auditable por saldo central.';
