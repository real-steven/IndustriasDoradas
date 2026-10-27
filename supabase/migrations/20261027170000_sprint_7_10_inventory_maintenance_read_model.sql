-- Sprint 7.10.4: catálogo mínimo y proyección gerencial de novedades.

create or replace function app.seed_operational_novelty_categories_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
begin
  insert into app.operational_novelty_categories (
    id, organization_id, code, name
  )
  select gen_random_uuid(), new.id, defaults.code, defaults.name
  from (values
    ('PARO', 'Paro'),
    ('MANTENIMIENTO', 'Mantenimiento'),
    ('EMERGENCIA', 'Emergencia'),
    ('FERIADO', 'Feriado'),
    ('OTRO', 'Otro')
  ) as defaults(code, name)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function app.seed_operational_novelty_categories_v1()
  from public, anon, authenticated;
grant execute on function app.seed_operational_novelty_categories_v1()
  to service_role;

create trigger trg_organizations_seed_operational_novelty_categories
after insert on app.organizations
for each row execute function app.seed_operational_novelty_categories_v1();

insert into app.operational_novelty_categories (
  id, organization_id, code, name
)
select gen_random_uuid(), organizations.id, defaults.code, defaults.name
from app.organizations as organizations
cross join (values
  ('PARO', 'Paro'),
  ('MANTENIMIENTO', 'Mantenimiento'),
  ('EMERGENCIA', 'Emergencia'),
  ('FERIADO', 'Feriado'),
  ('OTRO', 'Otro')
) as defaults(code, name)
on conflict do nothing;

create view app.management_operational_novelties
with (security_invoker = true)
as
select
  opening.organization_id,
  opening.plant_id,
  opening.novelty_id,
  opening.id as opening_change_id,
  opening.line_id,
  lines.name as line_name,
  opening.category_id,
  categories.code as category_code,
  categories.name as category_name,
  opening.description,
  opening.actor_profile_id as opened_by_profile_id,
  opening_actor.display_name as opened_by_display_name,
  opening.responsible_worker_id as opening_responsible_worker_id,
  opening_worker.name as opening_responsible_worker_name,
  opening.occurred_at_utc as opened_at_utc,
  opening.recorded_at_utc as opening_recorded_at_utc,
  closure.id as closure_change_id,
  closure.actor_profile_id as closed_by_profile_id,
  closure_actor.display_name as closed_by_display_name,
  closure.responsible_worker_id as closure_responsible_worker_id,
  closure_worker.name as closure_responsible_worker_name,
  closure.occurred_at_utc as closed_at_utc,
  closure.recorded_at_utc as closure_recorded_at_utc,
  closure.id is null as is_open,
  case when closure.id is null then null else
    floor(extract(epoch from (closure.occurred_at_utc - opening.occurred_at_utc)) / 60)::bigint
  end as duration_minutes
from app.operational_novelty_changes as opening
left join app.operational_novelty_changes as closure
  on closure.organization_id = opening.organization_id
 and closure.novelty_id = opening.novelty_id
 and closure.change_type = 'CLOSURE'
left join app.production_lines as lines
  on lines.organization_id = opening.organization_id
 and lines.plant_id = opening.plant_id
 and lines.id = opening.line_id
left join app.operational_novelty_categories as categories
  on categories.organization_id = opening.organization_id
 and categories.id = opening.category_id
join app.user_profiles as opening_actor
  on opening_actor.organization_id = opening.organization_id
 and opening_actor.id = opening.actor_profile_id
left join app.user_profiles as closure_actor
  on closure_actor.organization_id = closure.organization_id
 and closure_actor.id = closure.actor_profile_id
left join app.workers as opening_worker
  on opening_worker.organization_id = opening.organization_id
 and opening_worker.id = opening.responsible_worker_id
left join app.workers as closure_worker
  on closure_worker.organization_id = closure.organization_id
 and closure_worker.id = closure.responsible_worker_id
where opening.change_type = 'OPENING';

revoke all on table app.management_operational_novelties
  from public, anon, authenticated, service_role;
grant select on table app.management_operational_novelties
  to service_role;

comment on view app.management_operational_novelties is
  'Novedades operativas reconstruidas desde aperturas y cierres append-only.';

alter table app.sync_changes drop constraint sync_changes_entity_type_check;
alter table app.sync_changes add constraint sync_changes_entity_type_check check (
  entity_type in (
    'SUPPLIER', 'WORKER', 'PRODUCTION_LINE', 'LINE_COMPONENT',
    'STATION', 'STATION_LINE_SCOPE', 'SHIPMENT',
    'RESPONSIBILITY_ASSIGNMENT', 'PRODUCTION_EVENT',
    'PRODUCTION_SWEEP', 'MERCURY_MOVEMENT', 'ADMINISTRATIVE_CORRECTION',
    'ATTENDANCE_EVENT', 'INVENTORY_ITEM_TYPE', 'INVENTORY_UNIT',
    'INVENTORY_ITEM', 'INVENTORY_MOVEMENT', 'INVENTORY_REVIEW',
    'RASTRA_COMPONENT_CHANGE', 'OPERATIONAL_NOVELTY_CATEGORY',
    'OPERATIONAL_NOVELTY_CHANGE'
  )
);

create function app.capture_inventory_maintenance_sync_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  sequence_value bigint := nextval('app.sync_changes_server_sequence_seq');
  entity_type_value text;
  entity_id_value uuid;
  plant_id_value uuid;
  action_value text := 'UPSERT';
begin
  case tg_table_name
    when 'rastra_component_changes' then
      entity_type_value := 'RASTRA_COMPONENT_CHANGE';
      entity_id_value := new.id;
      plant_id_value := new.plant_id;
    when 'operational_novelty_categories' then
      entity_type_value := 'OPERATIONAL_NOVELTY_CATEGORY';
      entity_id_value := new.id;
      plant_id_value := null;
      action_value := case when new.is_active then 'UPSERT' else 'DEACTIVATE' end;
    when 'operational_novelty_changes' then
      entity_type_value := 'OPERATIONAL_NOVELTY_CHANGE';
      entity_id_value := new.id;
      plant_id_value := new.plant_id;
    else
      raise exception using errcode = '23514', message = 'UNSUPPORTED_MAINTENANCE_SYNC_SOURCE';
  end case;

  insert into app.sync_changes (
    change_id, server_sequence, organization_id, plant_id, station_id,
    entity_type, entity_id, entity_version, action, changed_at_utc,
    payload_schema_version, payload
  ) values (
    gen_random_uuid(), sequence_value, new.organization_id, plant_id_value, null,
    entity_type_value, entity_id_value, sequence_value, action_value,
    now(), 1, to_jsonb(new)
  );
  return new;
end;
$$;

revoke all on function app.capture_inventory_maintenance_sync_change_v1()
  from public, anon, authenticated;

create trigger trg_rastra_component_changes_sync_change
after insert on app.rastra_component_changes
for each row execute function app.capture_inventory_maintenance_sync_change_v1();
create trigger trg_operational_novelty_categories_sync_change
after insert or update on app.operational_novelty_categories
for each row execute function app.capture_inventory_maintenance_sync_change_v1();
create trigger trg_operational_novelty_changes_sync_change
after insert on app.operational_novelty_changes
for each row execute function app.capture_inventory_maintenance_sync_change_v1();

do $$
declare
  item record;
  sequence_value bigint;
begin
  for item in
    select 'OPERATIONAL_NOVELTY_CATEGORY'::text as entity_type,
      value.id, value.organization_id, null::uuid as plant_id,
      to_jsonb(value) as payload,
      case when value.is_active then 'UPSERT' else 'DEACTIVATE' end as action
    from app.operational_novelty_categories as value
    union all
    select 'RASTRA_COMPONENT_CHANGE', value.id, value.organization_id,
      value.plant_id, to_jsonb(value), 'UPSERT'
    from app.rastra_component_changes as value
    union all
    select 'OPERATIONAL_NOVELTY_CHANGE', value.id, value.organization_id,
      value.plant_id, to_jsonb(value), 'UPSERT'
    from app.operational_novelty_changes as value
  loop
    sequence_value := nextval('app.sync_changes_server_sequence_seq');
    insert into app.sync_changes (
      change_id, server_sequence, organization_id, plant_id, station_id,
      entity_type, entity_id, entity_version, action, changed_at_utc,
      payload_schema_version, payload
    ) values (
      gen_random_uuid(), sequence_value, item.organization_id, item.plant_id, null,
      item.entity_type, item.id, sequence_value, item.action, now(), 1, item.payload
    );
  end loop;
end;
$$;

create function app.ingest_inventory_maintenance_sync_item_v1(input_item jsonb)
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
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id_value::text || ':' || station_id_value::text
      || ':' || outbox_message_id_value::text, 0));

  select * into existing_receipt from app.sync_receipts
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
    select 1 from app.user_profiles as profile
    join app.role_permissions as role_permission on role_permission.role_id = profile.role_id
    join app.permissions as permission on permission.id = role_permission.permission_id
    where profile.organization_id = organization_id_value
      and profile.id = actor_profile_id_value and profile.is_active
      and permission.code = 'inventory.manage' and permission.is_active
  ) then
    result_code_value := 'PERMISSION_DENIED';
  end if;

  if result_code_value is null then
    begin
      if operation_type_value = 'RASTRA_COMPONENT_CHANGE_RECORDED'
         and aggregate_type_value = 'rastra_component_change' then
        insert into app.rastra_component_changes (
          id, organization_id, plant_id, rastra_id, change_type,
          installation_id, replaced_installation_id, inventory_item_id,
          unit_id, quantity, actor_profile_id, station_id, client_sequence,
          responsible_worker_id, occurred_at_utc, recorded_at_utc,
          component_identifier, installed_condition, removed_condition,
          reason, installation_notes, removal_notes
        ) values (
          aggregate_id_value, organization_id_value, plant_id_value,
          (payload_value ->> 'rastraId')::uuid,
          payload_value ->> 'changeType',
          (payload_value ->> 'installationId')::uuid,
          nullif(payload_value ->> 'replacedInstallationId', '')::uuid,
          nullif(payload_value ->> 'inventoryItemId', '')::uuid,
          nullif(payload_value ->> 'unitId', '')::uuid,
          nullif(payload_value ->> 'quantity', '')::numeric,
          actor_profile_id_value, station_id_value, station_sequence_value,
          nullif(payload_value ->> 'responsibleWorkerId', '')::uuid,
          (payload_value ->> 'occurredAtUtc')::timestamptz,
          (payload_value ->> 'recordedAtUtc')::timestamptz,
          nullif(payload_value ->> 'componentIdentifier', ''),
          nullif(payload_value ->> 'installedCondition', ''),
          nullif(payload_value ->> 'removedCondition', ''),
          nullif(payload_value ->> 'reason', ''),
          nullif(payload_value ->> 'installationNotes', ''),
          nullif(payload_value ->> 'removalNotes', '')
        );
      elsif operation_type_value in (
              'OPERATIONAL_NOVELTY_OPENED', 'OPERATIONAL_NOVELTY_CLOSED'
            ) and aggregate_type_value = 'operational_novelty_change' then
        insert into app.operational_novelty_changes (
          id, novelty_id, organization_id, plant_id, change_type,
          line_id, category_id, description, actor_profile_id, station_id,
          client_sequence, responsible_worker_id, occurred_at_utc, recorded_at_utc
        ) values (
          aggregate_id_value, (payload_value ->> 'noveltyId')::uuid,
          organization_id_value, plant_id_value,
          case when operation_type_value = 'OPERATIONAL_NOVELTY_OPENED'
            then 'OPENING' else 'CLOSURE' end,
          nullif(payload_value ->> 'lineId', '')::uuid,
          nullif(payload_value ->> 'categoryId', '')::uuid,
          nullif(payload_value ->> 'description', ''),
          actor_profile_id_value, station_id_value, station_sequence_value,
          nullif(payload_value ->> 'responsibleWorkerId', '')::uuid,
          (payload_value ->> 'occurredAtUtc')::timestamptz,
          (payload_value ->> 'recordedAtUtc')::timestamptz
        );
      else
        result_code_value := 'INVALID_EVENT';
      end if;
    exception when integrity_constraint_violation or data_exception then
      get stacked diagnostics error_message_value = message_text;
      result_code_value := coalesce(error_message_value, 'DEPENDENCY_REJECTED');
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

revoke all on function app.ingest_inventory_maintenance_sync_item_v1(jsonb)
  from public, anon, authenticated;
grant execute on function app.ingest_inventory_maintenance_sync_item_v1(jsonb)
  to service_role;

comment on function app.ingest_inventory_maintenance_sync_item_v1(jsonb) is
  'Ingiere cambios de componente y novedades offline con recibo y auditoría.';
