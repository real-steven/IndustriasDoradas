-- Ingestión de los eventos de "Seguridad del sistema" de desktop.
--
-- Hasta ahora estos eventos solo vivían en SQLite: no tenían Outbox, contrato ni
-- ingestión, por lo que la auditoría central solo conocía la validación de PIN
-- en línea (privilege.elevation) y nunca la biometría, la cámara, la ausencia de
-- rostro ni el uso del PIN como alternativa.
--
-- Cada evento se guarda una sola vez en app.audit_events (append-only, RLS) con
-- su hora original. Solo se aceptan códigos: el payload no admite PIN,
-- contraseña, token, plantilla, imagen ni características faciales.
-- No se publica en sync_changes: otras estaciones no necesitan este historial.

create function app.ingest_station_security_sync_item_v1(input_item jsonb)
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
  content_hash_value text := input_item ->> 'contentHash';
  correlation_id_value uuid := (input_item ->> 'correlationId')::uuid;
  receipt_id_value uuid := (input_item ->> 'receiptId')::uuid;
  audit_event_id_value uuid := (input_item ->> 'auditEventId')::uuid;
  processed_at_value timestamptz :=
    (input_item ->> 'processedAtUtc')::timestamptz;
  result_code_value text := nullif(input_item ->> 'precheckCode', '');
  result_status_value text;
  event_type_value text := payload_value ->> 'eventType';
  method_value text := nullif(payload_value ->> 'method', '');
  security_result_value text := payload_value ->> 'result';
  actor_profile_id_value uuid :=
    nullif(payload_value ->> 'actorProfileId', '')::uuid;
  actor_auth_user_id_value uuid;
  actor_display_name_value text;
  actor_role_code_value text;
  actor_found boolean := false;
  audit_result_value app.audit_result;
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

  -- La sesión que sincroniza ya fue validada por NestJS. Un evento de auditoría
  -- no se descarta por una versión de permisos posterior ni por contingencia
  -- offline: describe un hecho de seguridad, no autoriza una mutación.
  if result_code_value is null and not exists (
    select 1 from app.stations
    where organization_id = organization_id_value
      and plant_id = plant_id_value
      and id = station_id_value
  ) then
    result_code_value := 'SCOPE_MISMATCH';
  end if;

  if result_code_value is null and (
    operation_type_value <> 'SECURITY_EVENT_RECORDED'
    or aggregate_type_value <> 'station_security_event'
    or aggregate_id_value <> (payload_value ->> 'eventId')::uuid
    or station_sequence_value <> (payload_value ->> 'clientSequence')::bigint
    or station_id_value <> (payload_value ->> 'stationId')::uuid
    or event_type_value not in (
      'SESSION_FOUND', 'SESSION_OPENED', 'SESSION_RESTORED', 'SESSION_CLOSED',
      'SESSION_EXPIRED', 'SESSION_REJECTED', 'ELEVATION_REQUESTED',
      'ELEVATION_ACCEPTED', 'ELEVATION_REJECTED', 'ELEVATION_ENDED',
      'BIOMETRIC_REJECTED', 'BIOMETRIC_FACE_NOT_DETECTED',
      'BIOMETRIC_CAMERA_UNAVAILABLE', 'BIOMETRIC_FAILED')
    or (method_value is not null and method_value not in (
      'PASSWORD', 'SESSION', 'PIN', 'PIN_FALLBACK', 'BIOMETRIC'))
    or security_result_value is null
    or security_result_value !~ '^[A-Z][A-Z0-9_]{0,39}$'
  ) then
    result_code_value := 'INVALID_EVENT';
  end if;

  if actor_profile_id_value is not null then
    select profile.auth_user_id, profile.display_name, role.code
      into actor_auth_user_id_value, actor_display_name_value, actor_role_code_value
    from app.user_profiles as profile
    join app.roles as role on role.id = profile.role_id
    where profile.organization_id = organization_id_value
      and profile.id = actor_profile_id_value;
    actor_found := found and actor_auth_user_id_value is not null;
  end if;

  audit_result_value := case
    when event_type_value in (
      'SESSION_REJECTED', 'ELEVATION_REJECTED', 'BIOMETRIC_REJECTED',
      'BIOMETRIC_FACE_NOT_DETECTED') then 'REJECTED'::app.audit_result
    when event_type_value in (
      'BIOMETRIC_CAMERA_UNAVAILABLE', 'BIOMETRIC_FAILED') then 'FAILED'::app.audit_result
    else 'SUCCEEDED'::app.audit_result
  end;

  -- Un mismo evento reenviado con otro sobre (recuperación de secuencia) no se
  -- duplica: la identidad del hecho es su eventId.
  if result_code_value is null and not exists (
    select 1 from app.audit_events
    where organization_id = organization_id_value
      and action = 'station.security'
      and entity_type = 'station_security_event'
      and entity_id = aggregate_id_value
  ) then
    begin
      insert into app.audit_events (
        id, organization_id, station_id, actor_kind, actor_profile_id,
        actor_auth_user_id, actor_display_name, actor_role_code, origin, action,
        entity_type, entity_id, occurred_at, correlation_id, result, reason_code,
        evidence_state, changed_fields, changes, request_method, request_path
      ) values (
        audit_event_id_value, organization_id_value, station_id_value,
        case when actor_found then 'AUTHENTICATED_USER'::app.audit_actor_kind
          else 'UNKNOWN'::app.audit_actor_kind end,
        case when actor_found then actor_profile_id_value else null end,
        case when actor_found then actor_auth_user_id_value else null end,
        case when actor_found then actor_display_name_value else null end,
        case when actor_found then actor_role_code_value else null end,
        'DESKTOP', 'station.security', 'station_security_event',
        aggregate_id_value, (payload_value ->> 'occurredAtUtc')::timestamptz,
        correlation_id_value, audit_result_value,
        case when audit_result_value = 'SUCCEEDED' then null
          else security_result_value end,
        'NOT_APPLICABLE',
        array['security_event', 'access_method', 'security_outcome'],
        jsonb_build_object(
          'security_event', jsonb_build_object('before', null, 'after', event_type_value),
          'access_method', jsonb_build_object('before', null, 'after', method_value),
          'security_outcome', jsonb_build_object('before', null, 'after', security_result_value)
        ),
        'POST',
        '/api/v1/organizations/{organizationId}/stations/{stationId}/sync/push'
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

  return jsonb_build_object(
    'outboxMessageId', outbox_message_id_value,
    'stationSequence', station_sequence_value,
    'status', result_status_value, 'receiptId', receipt_id_value,
    'code', result_code_value, 'processedAtUtc', processed_at_value
  );
end;
$$;

revoke all on function app.ingest_station_security_sync_item_v1(jsonb)
  from public, anon, authenticated;
grant execute on function app.ingest_station_security_sync_item_v1(jsonb)
  to service_role;

-- capture_administrative_correction_v1 publica a las estaciones cualquier evento
-- autenticado y exitoso con cambios. Un evento de seguridad no es una corrección
-- administrativa: sin esta condición, cada elevación aceptada aparecería en
-- desktop como aviso de corrección. Se limita el disparador con WHEN y no se
-- modifica la función existente.
create or replace trigger trg_audit_events_administrative_correction
after insert on app.audit_events
for each row
when (new.action is distinct from 'station.security')
execute function app.capture_administrative_correction_v1();
