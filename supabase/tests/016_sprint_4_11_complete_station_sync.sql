-- Verifica que la operacion se publique por planta, que oro quede fuera y que
-- las mediciones nuevas conserven recibos idempotentes.

do $$
declare
  input_item jsonb;
  result jsonb;
begin
  if not exists (
    select 1 from app.sync_changes
    where entity_type = 'PRODUCTION_EVENT'
      and entity_id = 'f4500000-0000-4000-8000-000000000001'
      and plant_id = '31000000-0000-4000-8000-000000000001'
      and station_id is null
  ) then
    raise exception 'production events must be broadcast to the whole plant';
  end if;
  if not exists (
    select 1 from app.sync_changes
    where entity_type = 'MERCURY_MOVEMENT'
      and entity_id = 'f4100000-0000-4000-8000-000000000011'
      and station_id is null
  ) then
    raise exception 'mercury measurements must be broadcast to the whole plant';
  end if;
  if exists (
    select 1 from app.sync_changes where entity_type like 'GOLD%'
  ) then
    raise exception 'gold must never enter the desktop sync feed';
  end if;

  input_item := jsonb_build_object(
    'organizationId', '30000000-0000-4000-8000-000000000001',
    'plantId', '31000000-0000-4000-8000-000000000001',
    'stationId', '34000000-0000-4000-8000-000000000001',
    'correlationId', 'fa000000-0000-4000-8000-000000000001',
    'receiptId', 'fb000000-0000-4000-8000-000000000001',
    'auditEventId', 'fc000000-0000-4000-8000-000000000001',
    'processedAtUtc', '2026-09-15T18:04:05Z',
    'createdAtUtc', '2026-09-15T18:04:01Z',
    'outboxMessageId', 'fd000000-0000-4000-8000-000000000001',
    'stationSequence', 5001,
    'contentHash', repeat('e', 64),
    'operationType', 'MERCURY_MOVEMENT_RECORDED',
    'aggregateType', 'mercury_movement',
    'aggregateId', 'fe000000-0000-4000-8000-000000000001',
    'authorization', jsonb_build_object(
      'actorProfileId', 'a1000000-0000-4000-8000-000000000002',
      'permissionVersion', 1,
      'validatedAtUtc', '2026-09-15T17:00:00Z',
      'offlineValidUntilUtc', '2026-09-16T17:00:00Z',
      'stateAtCapture', 'VALID'
    ),
    'payload', jsonb_build_object(
      'schemaVersion', 1,
      'movementId', 'fe000000-0000-4000-8000-000000000001',
      'organizationId', '30000000-0000-4000-8000-000000000001',
      'plantId', '31000000-0000-4000-8000-000000000001',
      'stationId', '34000000-0000-4000-8000-000000000001',
      'lineId', '32000000-0000-4000-8000-000000000001',
      'feedCycleId', 'c3000000-0000-4000-8000-000000000001',
      'shipmentId', 'c2000000-0000-4000-8000-000000000001',
      'lineComponentId', '33000000-0000-4000-8001-000000000002',
      'sweepId', 'f4000000-0000-4000-8000-000000000001',
      'clientSequence', 5001,
      'movementKind', 'SWEEP_INPUT',
      'amountGrams', 12.30,
      'unitCode', 'g',
      'occurredAtUtc', '2026-09-15T18:04:00Z',
      'recordedAtUtc', '2026-09-15T18:04:01Z',
      'recordedByProfileId', 'a1000000-0000-4000-8000-000000000002',
      'supersedesMovementId', null,
      'notes', null
    ),
    'precheckCode', null
  );

  result := app.ingest_extended_sync_item_v1(
    input_item || jsonb_build_object(
      'outboxMessageId', 'fd000000-0000-4000-8000-000000000099',
      'stationSequence', 5000,
      'aggregateId', 'fe000000-0000-4000-8000-000000000099',
      'contentHash', repeat('f', 64),
      'payload', (input_item -> 'payload') || jsonb_build_object(
        'movementId', 'fe000000-0000-4000-8000-000000000099',
        'sweepId', 'f4000000-0000-4000-8000-000000000099',
        'clientSequence', 5000
      )
    )
  );
  if result ->> 'status' <> 'RETRY_LATER'
     or result ->> 'code' <> 'DEPENDENCY_NOT_READY' then
    raise exception 'out-of-order dependencies must remain retryable: %', result;
  end if;
  if exists (
    select 1 from app.sync_receipts
    where outbox_message_id = 'fd000000-0000-4000-8000-000000000099'
  ) then
    raise exception 'retryable dependencies must not consume their idempotency key';
  end if;

  result := app.ingest_extended_sync_item_v1(input_item);
  if result ->> 'status' <> 'APPLIED' then
    raise exception 'valid mercury measurement must apply: %', result;
  end if;
  result := app.ingest_extended_sync_item_v1(
    input_item || jsonb_build_object(
      'receiptId', 'fb000000-0000-4000-8000-000000000099',
      'auditEventId', 'fc000000-0000-4000-8000-000000000099'
    )
  );
  if result ->> 'status' <> 'ALREADY_APPLIED' then
    raise exception 'extended ingestion must be idempotent: %', result;
  end if;
end;
$$;
