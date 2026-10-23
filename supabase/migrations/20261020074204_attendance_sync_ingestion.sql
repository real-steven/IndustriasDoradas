-- Sprint 6.7: sincronización incremental de asistencia entre estaciones.
-- Los hechos permanecen append-only; una corrección es otro evento y nunca un UPDATE.

alter table app.sync_changes drop constraint sync_changes_entity_type_check;
alter table app.sync_changes add constraint sync_changes_entity_type_check check (
  entity_type in (
    'SUPPLIER', 'WORKER', 'PRODUCTION_LINE', 'LINE_COMPONENT',
    'STATION', 'STATION_LINE_SCOPE', 'SHIPMENT',
    'RESPONSIBILITY_ASSIGNMENT', 'PRODUCTION_EVENT',
    'PRODUCTION_SWEEP', 'MERCURY_MOVEMENT', 'ADMINISTRATIVE_CORRECTION',
    'ATTENDANCE_EVENT'
  )
);

create function app.capture_attendance_sync_change_v1()
returns trigger
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
    gen_random_uuid(), sequence_value, new.organization_id, new.plant_id, null,
    'ATTENDANCE_EVENT', new.id, sequence_value,
    case when new.event_type in ('ADJUSTED_CHECK_IN', 'ADJUSTED_CHECK_OUT')
      then 'CORRECTION_APPENDED' else 'UPSERT' end,
    now(), 1, to_jsonb(new)
  );
  return new;
end;
$$;

revoke all on function app.capture_attendance_sync_change_v1()
  from public, anon, authenticated;

create trigger trg_attendance_events_sync_change
after insert on app.attendance_events
for each row execute function app.capture_attendance_sync_change_v1();

create function app.ingest_attendance_sync_item_v1(input_item jsonb)
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
  actor_profile_id_value uuid :=
    (input_item #>> '{authorization,actorProfileId}')::uuid;
  content_hash_value text := input_item ->> 'contentHash';
  correlation_id_value uuid := (input_item ->> 'correlationId')::uuid;
  receipt_id_value uuid := (input_item ->> 'receiptId')::uuid;
  audit_event_id_value uuid := (input_item ->> 'auditEventId')::uuid;
  processed_at_value timestamptz :=
    (input_item ->> 'processedAtUtc')::timestamptz;
  result_code_value text := nullif(input_item ->> 'precheckCode', '');
  result_status_value text;
  actor_auth_user_id_value uuid;
  actor_display_name_value text;
  actor_role_code_value text;
  event_type_value text := payload_value ->> 'eventType';
  required_permission_value text;
  related_event_id_value uuid :=
    nullif(payload_value ->> 'relatedEventId', '')::uuid;
  lock_key text;
begin
  lock_key := organization_id_value::text || ':' || station_id_value::text
    || ':' || outbox_message_id_value::text;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(lock_key, 0)
  );

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

  required_permission_value := case
    when event_type_value in ('ADJUSTED_CHECK_IN', 'ADJUSTED_CHECK_OUT')
      then 'attendance.correct'
    else 'attendance.record'
  end;
  if result_code_value is null and not exists (
    select 1
    from app.user_profiles as profile
    join app.role_permissions as role_permission
      on role_permission.role_id = profile.role_id
    join app.permissions as permission
      on permission.id = role_permission.permission_id
    where profile.organization_id = organization_id_value
      and profile.id = actor_profile_id_value
      and profile.is_active
      and permission.code = required_permission_value
      and permission.is_active
  ) then
    result_code_value := 'PERMISSION_DENIED';
  end if;

  if result_code_value is null and (
    operation_type_value <> 'ATTENDANCE_EVENT_RECORDED'
    or aggregate_type_value <> 'attendance_event'
    or aggregate_id_value <> (payload_value ->> 'clientEventId')::uuid
    or station_sequence_value <> (payload_value ->> 'clientSequence')::bigint
  ) then
    result_code_value := 'INVALID_EVENT';
  end if;

  if result_code_value is null and not exists (
    select 1 from app.workers
    where organization_id = organization_id_value
      and plant_id = plant_id_value
      and id = (payload_value ->> 'workerId')::uuid
  ) then
    return jsonb_build_object(
      'outboxMessageId', outbox_message_id_value,
      'stationSequence', station_sequence_value,
      'status', 'RETRY_LATER', 'code', 'DEPENDENCY_NOT_READY',
      'processedAtUtc', processed_at_value
    );
  end if;

  if result_code_value is null
     and related_event_id_value is not null
     and not exists (
       select 1 from app.attendance_events
       where organization_id = organization_id_value
         and id = related_event_id_value
     ) then
    return jsonb_build_object(
      'outboxMessageId', outbox_message_id_value,
      'stationSequence', station_sequence_value,
      'status', 'RETRY_LATER', 'code', 'DEPENDENCY_NOT_READY',
      'processedAtUtc', processed_at_value
    );
  end if;

  if result_code_value is null then
    begin
      insert into app.attendance_events (
        id, organization_id, plant_id, station_id, worker_id,
        client_sequence, event_type, occurred_at_utc, recorded_at_utc,
        confirmed_at_utc, sync_status, corrected_by_profile_id,
        correction_reason, related_event_id
      ) values (
        aggregate_id_value, organization_id_value, plant_id_value,
        station_id_value, (payload_value ->> 'workerId')::uuid,
        station_sequence_value, event_type_value,
        (payload_value ->> 'occurredAtUtc')::timestamptz,
        (payload_value ->> 'recordedAtUtc')::timestamptz,
        processed_at_value, 'SYNCHRONIZED',
        nullif(payload_value ->> 'correctedByProfileId', '')::uuid,
        nullif(payload_value ->> 'correctionReason', ''),
        related_event_id_value
      );
    exception
      when integrity_constraint_violation or data_exception
        or insufficient_privilege then
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
    actor_display_name_value, actor_role_code_value, 'SYNC',
    case when event_type_value in ('ADJUSTED_CHECK_IN', 'ADJUSTED_CHECK_OUT')
      then 'attendance.correct' else 'attendance.record' end,
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

revoke all on function app.ingest_attendance_sync_item_v1(jsonb)
  from public, anon, authenticated;
grant execute on function app.ingest_attendance_sync_item_v1(jsonb)
  to service_role;

-- Publica cualquier marca central previa para clientes cuyo cursor ya avanzó.
do $$
declare
  item app.attendance_events%rowtype;
  sequence_value bigint;
begin
  for item in
    select * from app.attendance_events order by created_at, id
  loop
    sequence_value := nextval('app.sync_changes_server_sequence_seq');
    insert into app.sync_changes (
      change_id, server_sequence, organization_id, plant_id, station_id,
      entity_type, entity_id, entity_version, action, changed_at_utc,
      payload_schema_version, payload
    ) values (
      gen_random_uuid(), sequence_value, item.organization_id, item.plant_id, null,
      'ATTENDANCE_EVENT', item.id, sequence_value,
      case when item.event_type in ('ADJUSTED_CHECK_IN', 'ADJUSTED_CHECK_OUT')
        then 'CORRECTION_APPENDED' else 'UPSERT' end,
      now(), 1, to_jsonb(item)
    );
  end loop;
end;
$$;
