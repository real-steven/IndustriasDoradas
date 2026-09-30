-- Verifica aplicación, duplicado estable, contenido distinto y aislamiento de inválidos.

do $$
declare
  start_input jsonb;
  event_input jsonb;
  invalid_input jsonb;
  result jsonb;
  actual_count integer;
begin
  start_input := jsonb_build_object(
    'organizationId', '30000000-0000-4000-8000-000000000001',
    'plantId', '31000000-0000-4000-8000-000000000001',
    'stationId', '34000000-0000-4000-8000-000000000001',
    'correlationId', 'ca000000-0000-4000-8000-000000000001',
    'receiptId', 'cb000000-0000-4000-8000-000000000001',
    'auditEventId', 'cc000000-0000-4000-8000-000000000001',
    'processedAtUtc', '2026-09-15T18:00:05Z',
    'outboxMessageId', 'c1000000-0000-4000-8000-000000000001',
    'stationSequence', 1,
    'contentHash', repeat('a', 64),
    'operationType', 'OPERATION_STARTED',
    'aggregateType', 'shipment',
    'aggregateId', 'c2000000-0000-4000-8000-000000000001',
    'payloadSchemaVersion', 1,
    'createdAtUtc', '2026-09-15T18:00:00Z',
    'authorization', jsonb_build_object(
      'actorProfileId', 'a1000000-0000-4000-8000-000000000002',
      'permissionVersion', 1,
      'validatedAtUtc', '2026-09-15T17:00:00Z',
      'offlineValidUntilUtc', '2026-09-16T17:00:00Z',
      'stateAtCapture', 'VALID'
    ),
    'payload', jsonb_build_object(
      'schemaVersion', 1,
      'shipmentId', 'c2000000-0000-4000-8000-000000000001',
      'feedCycleId', 'c3000000-0000-4000-8000-000000000001',
      'responsibilityAssignmentId', 'c4000000-0000-4000-8000-000000000001',
      'organizationId', '30000000-0000-4000-8000-000000000001',
      'plantId', '31000000-0000-4000-8000-000000000001',
      'stationId', '34000000-0000-4000-8000-000000000001',
      'lineId', '32000000-0000-4000-8000-000000000001',
      'supplierId', '35000000-0000-4000-8000-000000000001',
      'responsibleWorkerId', 'b1000000-0000-4000-8000-000000000001',
      'actorProfileId', 'a1000000-0000-4000-8000-000000000002',
      'permissionVersion', 1,
      'occurredAtUtc', '2026-09-15T18:00:00Z'
    ),
    'precheckCode', null
  );

  result := app.ingest_sync_item_v1(start_input);
  if result ->> 'status' <> 'APPLIED' then
    raise exception 'valid operation start must be applied: %', result;
  end if;

  result := app.ingest_sync_item_v1(
    start_input
    || jsonb_build_object(
      'receiptId', 'cb000000-0000-4000-8000-000000000099',
      'auditEventId', 'cc000000-0000-4000-8000-000000000099',
      'processedAtUtc', '2026-09-15T18:00:10Z'
    )
  );
  if result ->> 'status' <> 'ALREADY_APPLIED'
     or result ->> 'receiptId' <> 'cb000000-0000-4000-8000-000000000001' then
    raise exception 'identical duplicate must return the durable receipt: %', result;
  end if;

  result := app.ingest_sync_item_v1(
    start_input
    || jsonb_build_object(
      'contentHash', repeat('b', 64),
      'processedAtUtc', '2026-09-15T18:00:15Z'
    )
  );
  if result ->> 'code' <> 'IDEMPOTENCY_CONTENT_MISMATCH' then
    raise exception 'same id with different content must require review: %', result;
  end if;

  event_input := jsonb_build_object(
    'organizationId', '30000000-0000-4000-8000-000000000001',
    'plantId', '31000000-0000-4000-8000-000000000001',
    'stationId', '34000000-0000-4000-8000-000000000001',
    'correlationId', 'ca000000-0000-4000-8000-000000000002',
    'receiptId', 'cb000000-0000-4000-8000-000000000002',
    'auditEventId', 'cc000000-0000-4000-8000-000000000002',
    'processedAtUtc', '2026-09-15T18:01:05Z',
    'outboxMessageId', 'c1000000-0000-4000-8000-000000000002',
    'stationSequence', 2,
    'contentHash', repeat('c', 64),
    'operationType', 'PRODUCTION_EVENT_CREATED',
    'aggregateType', 'production_event',
    'aggregateId', 'c5000000-0000-4000-8000-000000000001',
    'payloadSchemaVersion', 2,
    'createdAtUtc', '2026-09-15T18:01:00Z',
    'authorization', start_input -> 'authorization',
    'payload', jsonb_build_object(
      'schemaVersion', 2,
      'clientEventId', 'c5000000-0000-4000-8000-000000000001',
      'organizationId', '30000000-0000-4000-8000-000000000001',
      'plantId', '31000000-0000-4000-8000-000000000001',
      'stationId', '34000000-0000-4000-8000-000000000001',
      'lineId', '32000000-0000-4000-8000-000000000001',
      'feedCycleId', 'c3000000-0000-4000-8000-000000000001',
      'shipmentId', 'c2000000-0000-4000-8000-000000000001',
      'responsibleWorkerId', 'b1000000-0000-4000-8000-000000000001',
      'eventType', 'CAJUELA_ADDED',
      'workPeriod', 'DAY',
      'occurredAtUtc', '2026-09-15T18:01:00Z',
      'recordedAtUtc', '2026-09-15T18:01:01Z',
      'clientSequence', 1,
      'quantityDelta', 1,
      'inputSourceKind', 'CLICK',
      'inputControllerId', 'shared-pointer',
      'inputSignalCode', 'RegisterCajuela',
      'inputLineSlot', 1,
      'inputWasRepeat', false
    ),
    'precheckCode', null
  );

  result := app.ingest_sync_item_v1(event_input);
  if result ->> 'status' <> 'APPLIED' then
    raise exception 'valid production event must be applied: %', result;
  end if;

  invalid_input := event_input || jsonb_build_object(
    'correlationId', 'ca000000-0000-4000-8000-000000000003',
    'receiptId', 'cb000000-0000-4000-8000-000000000003',
    'auditEventId', 'cc000000-0000-4000-8000-000000000003',
    'outboxMessageId', 'c1000000-0000-4000-8000-000000000003',
    'stationSequence', 3,
    'aggregateId', 'c5000000-0000-4000-8000-000000000003',
    'contentHash', repeat('d', 64),
    'payload', '{}'::jsonb,
    'precheckCode', 'INVALID_EVENT'
  );
  result := app.ingest_sync_item_v1(invalid_input);
  if result ->> 'status' <> 'FAILED_REVIEW'
     or result ->> 'code' <> 'INVALID_EVENT' then
    raise exception 'invalid item must be isolated for review: %', result;
  end if;

  select count(*) into actual_count
  from app.shipments
  where id = 'c2000000-0000-4000-8000-000000000001';
  if actual_count <> 1 then
    raise exception 'operation start must create exactly one shipment';
  end if;

  select count(*) into actual_count
  from app.production_events
  where id = 'c5000000-0000-4000-8000-000000000001';
  if actual_count <> 1 then
    raise exception 'valid production event must be persisted exactly once';
  end if;

  select count(*) into actual_count
  from app.sync_receipts
  where outbox_message_id in (
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000003'
  );
  if actual_count <> 3 then
    raise exception 'valid and rejected items must each have one durable receipt';
  end if;
end;
$$;
