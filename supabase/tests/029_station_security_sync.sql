-- Seguridad del sistema: un único evento auditado por resultado biométrico,
-- reintento idempotente, hora original y ejecución exclusiva del backend.

do $$
declare
  base_input jsonb;
  face_input jsonb;
  ingest_result jsonb;
begin
  if has_function_privilege('anon', 'app.ingest_station_security_sync_item_v1(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'app.ingest_station_security_sync_item_v1(jsonb)', 'execute') then
    raise exception 'station security ingestion must be backend-only';
  end if;
  if not has_function_privilege('service_role', 'app.ingest_station_security_sync_item_v1(jsonb)', 'execute') then
    raise exception 'service_role must ingest station security events';
  end if;

  base_input := jsonb_build_object(
    'organizationId', '30000000-0000-4000-8000-000000000001',
    'plantId', '31000000-0000-4000-8000-000000000001',
    'stationId', '34000000-0000-4000-8000-000000000001',
    'correlationId', '7e000000-0000-4000-8000-000000000001',
    'clientApplication', 'desktop',
    'clientApplicationVersion', '0.1.0',
    'clientSentAtUtc', '2026-11-10T18:00:00Z',
    'processedAtUtc', '2026-11-10T18:00:01Z',
    'authorization', jsonb_build_object(
      'actorProfileId', 'a1000000-0000-4000-8000-000000000002',
      'permissionVersion', 1,
      'validatedAtUtc', '2026-11-10T11:00:00Z',
      'offlineValidUntilUtc', '2026-11-11T11:00:00Z',
      'stateAtCapture', 'VALID'
    ),
    'operationType', 'SECURITY_EVENT_RECORDED',
    'aggregateType', 'station_security_event',
    'payloadSchemaVersion', 1,
    'precheckCode', null
  );

  face_input := base_input || jsonb_build_object(
    'outboxMessageId', '7e100000-0000-4000-8000-000000000001',
    'stationSequence', 9001,
    'contentHash', repeat('c', 64),
    'aggregateId', '7e200000-0000-4000-8000-000000000001',
    'receiptId', '7e300000-0000-4000-8000-000000000001',
    'auditEventId', '7e400000-0000-4000-8000-000000000001',
    'createdAtUtc', '2026-11-10T12:00:00Z',
    'payload', jsonb_build_object(
      'schemaVersion', 1,
      'eventId', '7e200000-0000-4000-8000-000000000001',
      'stationId', '34000000-0000-4000-8000-000000000001',
      'clientSequence', 9001,
      'actorProfileId', 'a1000000-0000-4000-8000-000000000002',
      'eventType', 'BIOMETRIC_FACE_NOT_DETECTED',
      'method', 'BIOMETRIC',
      'result', 'TIEMPO_AGOTADO',
      'occurredAtUtc', '2026-11-10T12:00:00Z'
    )
  );

  ingest_result := app.ingest_station_security_sync_item_v1(face_input);
  if ingest_result ->> 'status' <> 'APPLIED' then
    raise exception 'biometric timeout must be audited: %', ingest_result;
  end if;

  ingest_result := app.ingest_station_security_sync_item_v1(face_input || jsonb_build_object(
    'receiptId', '7e300000-0000-4000-8000-000000000002',
    'auditEventId', '7e400000-0000-4000-8000-000000000002'
  ));
  if ingest_result ->> 'status' <> 'ALREADY_APPLIED' then
    raise exception 'security replay must be idempotent: %', ingest_result;
  end if;

  if (select count(*) from app.audit_events
      where action = 'station.security'
        and entity_id = '7e200000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'each security result must be stored exactly once';
  end if;

  if not exists (
    select 1 from app.audit_events
    where id = '7e400000-0000-4000-8000-000000000001'
      and occurred_at = '2026-11-10T12:00:00Z'
      and result = 'REJECTED'
      and reason_code = 'TIEMPO_AGOTADO'
      and changes -> 'access_method' ->> 'after' = 'BIOMETRIC'
      and origin = 'DESKTOP'
  ) then
    raise exception 'security event must keep original time, method and outcome';
  end if;

  -- Un evento exitoso y autenticado no debe llegar a desktop como corrección.
  ingest_result := app.ingest_station_security_sync_item_v1(face_input || jsonb_build_object(
    'outboxMessageId', '7e100000-0000-4000-8000-000000000002',
    'stationSequence', 9002,
    'contentHash', repeat('e', 64),
    'aggregateId', '7e200000-0000-4000-8000-000000000002',
    'receiptId', '7e300000-0000-4000-8000-000000000004',
    'auditEventId', '7e400000-0000-4000-8000-000000000004',
    'payload', (face_input -> 'payload') || jsonb_build_object(
      'eventId', '7e200000-0000-4000-8000-000000000002',
      'clientSequence', 9002,
      'eventType', 'ELEVATION_ACCEPTED',
      'result', 'ACEPTADO'
    )
  ));
  if ingest_result ->> 'status' <> 'APPLIED' then
    raise exception 'biometric elevation must be audited: %', ingest_result;
  end if;

  if exists (
    select 1 from app.sync_changes
    where entity_id in (
        '7e200000-0000-4000-8000-000000000001',
        '7e200000-0000-4000-8000-000000000002',
        '7e400000-0000-4000-8000-000000000001',
        '7e400000-0000-4000-8000-000000000004')
       or payload ->> 'event_action' = 'station.security'
  ) then
    raise exception 'security history must not be published to other stations';
  end if;

  ingest_result := app.ingest_station_security_sync_item_v1(face_input || jsonb_build_object(
    'outboxMessageId', '7e100000-0000-4000-8000-000000000003',
    'stationSequence', 9003,
    'contentHash', repeat('d', 64),
    'receiptId', '7e300000-0000-4000-8000-000000000003',
    'auditEventId', '7e400000-0000-4000-8000-000000000003',
    'payload', (face_input -> 'payload') || jsonb_build_object(
      'clientSequence', 9003,
      'eventType', 'FACE_TEMPLATE_STORED'
    )
  ));
  if ingest_result ->> 'status' <> 'FAILED_REVIEW' or ingest_result ->> 'code' <> 'INVALID_EVENT' then
    raise exception 'unknown security event types must be rejected: %', ingest_result;
  end if;
end;
$$;
