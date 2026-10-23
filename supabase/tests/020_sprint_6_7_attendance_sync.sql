-- Sincronización de asistencia: hora original, idempotencia, dependencia
-- fuera de orden y publicación para todas las estaciones de la planta.

do $$
declare
  base_input jsonb;
  check_in_input jsonb;
  correction_input jsonb;
  result jsonb;
begin
  base_input := jsonb_build_object(
    'organizationId', '30000000-0000-4000-8000-000000000001',
    'plantId', '31000000-0000-4000-8000-000000000001',
    'stationId', '34000000-0000-4000-8000-000000000001',
    'correlationId', '76000000-0000-4000-8000-000000000001',
    'clientApplication', 'desktop',
    'clientApplicationVersion', '0.1.0',
    'clientSentAtUtc', '2026-10-20T18:00:00Z',
    'processedAtUtc', '2026-10-20T18:00:01Z',
    'authorization', jsonb_build_object(
      'actorProfileId', 'a1000000-0000-4000-8000-000000000002',
      'permissionVersion', 1,
      'validatedAtUtc', '2026-10-19T11:00:00Z',
      'offlineValidUntilUtc', '2026-10-21T11:00:00Z',
      'stateAtCapture', 'VALID'
    ),
    'operationType', 'ATTENDANCE_EVENT_RECORDED',
    'aggregateType', 'attendance_event',
    'payloadSchemaVersion', 1,
    'precheckCode', null
  );

  check_in_input := base_input || jsonb_build_object(
    'outboxMessageId', '76100000-0000-4000-8000-000000000001',
    'stationSequence', 7001,
    'contentHash', repeat('a', 64),
    'aggregateId', '76200000-0000-4000-8000-000000000001',
    'receiptId', '76300000-0000-4000-8000-000000000001',
    'auditEventId', '76400000-0000-4000-8000-000000000001',
    'createdAtUtc', '2026-10-19T12:00:01Z',
    'payload', jsonb_build_object(
      'schemaVersion', 1,
      'clientEventId', '76200000-0000-4000-8000-000000000001',
      'organizationId', '30000000-0000-4000-8000-000000000001',
      'plantId', '31000000-0000-4000-8000-000000000001',
      'stationId', '34000000-0000-4000-8000-000000000001',
      'workerId', 'b1000000-0000-4000-8000-000000000001',
      'eventType', 'CHECK_IN',
      'clientSequence', 7001,
      'occurredAtUtc', '2026-10-19T12:00:00Z',
      'recordedAtUtc', '2026-10-19T12:00:01Z',
      'correctedByProfileId', null,
      'correctionReason', null,
      'relatedEventId', null
    )
  );

  correction_input := base_input || jsonb_build_object(
    'outboxMessageId', '76100000-0000-4000-8000-000000000002',
    'stationSequence', 7002,
    'contentHash', repeat('b', 64),
    'aggregateId', '76200000-0000-4000-8000-000000000002',
    'receiptId', '76300000-0000-4000-8000-000000000002',
    'auditEventId', '76400000-0000-4000-8000-000000000002',
    'createdAtUtc', '2026-10-20T12:00:00Z',
    'payload', jsonb_build_object(
      'schemaVersion', 1,
      'clientEventId', '76200000-0000-4000-8000-000000000002',
      'organizationId', '30000000-0000-4000-8000-000000000001',
      'plantId', '31000000-0000-4000-8000-000000000001',
      'stationId', '34000000-0000-4000-8000-000000000001',
      'workerId', 'b1000000-0000-4000-8000-000000000001',
      'eventType', 'ADJUSTED_CHECK_OUT',
      'clientSequence', 7002,
      'occurredAtUtc', '2026-10-19T22:00:00Z',
      'recordedAtUtc', '2026-10-20T12:00:00Z',
      'correctedByProfileId', 'a1000000-0000-4000-8000-000000000002',
      'correctionReason', 'Salida olvidada confirmada por el jefe de planta.',
      'relatedEventId', '76200000-0000-4000-8000-000000000001'
    )
  );

  result := app.ingest_attendance_sync_item_v1(correction_input);
  if result ->> 'status' <> 'RETRY_LATER'
     or result ->> 'code' <> 'DEPENDENCY_NOT_READY' then
    raise exception 'early correction must remain retryable: %', result;
  end if;
  if exists (
    select 1 from app.sync_receipts
    where outbox_message_id = '76100000-0000-4000-8000-000000000002'
  ) then
    raise exception 'retryable correction must not consume its receipt';
  end if;

  result := app.ingest_attendance_sync_item_v1(check_in_input);
  if result ->> 'status' <> 'APPLIED' then
    raise exception 'attendance check-in must apply: %', result;
  end if;
  result := app.ingest_attendance_sync_item_v1(correction_input);
  if result ->> 'status' <> 'APPLIED' then
    raise exception 'attendance correction must apply after dependency: %', result;
  end if;
  result := app.ingest_attendance_sync_item_v1(
    check_in_input || jsonb_build_object(
      'receiptId', '76300000-0000-4000-8000-000000000099',
      'auditEventId', '76400000-0000-4000-8000-000000000099'
    )
  );
  if result ->> 'status' <> 'ALREADY_APPLIED' then
    raise exception 'attendance replay must be idempotent: %', result;
  end if;

  if (select occurred_at_utc from app.attendance_events
      where id = '76200000-0000-4000-8000-000000000001')
      <> '2026-10-19T12:00:00Z'::timestamptz then
    raise exception 'original offline occurrence time was not preserved';
  end if;
  if (select count(*) from app.sync_changes
      where entity_type = 'ATTENDANCE_EVENT'
        and entity_id in (
          '76200000-0000-4000-8000-000000000001',
          '76200000-0000-4000-8000-000000000002'
        )) <> 2 then
    raise exception 'each attendance event must be published exactly once';
  end if;
  if not exists (
    select 1 from app.sync_changes
    where entity_type = 'ATTENDANCE_EVENT'
      and entity_id = '76200000-0000-4000-8000-000000000002'
      and action = 'CORRECTION_APPENDED'
      and station_id is null
  ) then
    raise exception 'remote correction must be broadcast as append-only history';
  end if;
end;
$$;
