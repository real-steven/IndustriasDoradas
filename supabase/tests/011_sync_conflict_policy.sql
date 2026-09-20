do $$
declare
  base_input jsonb;
  attempt jsonb;
  result jsonb;
  production_count_before integer;
  production_count_after integer;
begin
  update app.suppliers
  set is_active = true, deactivated_at = null, updated_at = now()
  where id = '35000000-0000-4000-8000-000000000001';

  update app.stations
  set is_active = true, deactivated_at = null, updated_at = now()
  where id = '34000000-0000-4000-8000-000000000001';

  update app.production_lines
  set is_active = true, deactivated_at = null, updated_at = now()
  where id = '32000000-0000-4000-8000-000000000002';

  update app.station_line_scopes
  set is_active = true, deactivated_at = null, updated_at = now()
  where organization_id = '30000000-0000-4000-8000-000000000001'
    and station_id = '34000000-0000-4000-8000-000000000001'
    and production_line_id = '32000000-0000-4000-8000-000000000002';

  select count(*) into production_count_before from app.production_events;

  base_input := jsonb_build_object(
    'organizationId', '30000000-0000-4000-8000-000000000001',
    'plantId', '31000000-0000-4000-8000-000000000001',
    'stationId', '34000000-0000-4000-8000-000000000001',
    'correlationId', 'da000000-0000-4000-8000-000000000001',
    'receiptId', 'db000000-0000-4000-8000-000000000001',
    'auditEventId', 'dc000000-0000-4000-8000-000000000001',
    'processedAtUtc', '2026-09-20T18:00:00Z',
    'outboxMessageId', 'd1000000-0000-4000-8000-000000000001',
    'stationSequence', 101,
    'contentHash', repeat('1', 64),
    'operationType', 'OPERATION_STARTED',
    'aggregateType', 'shipment',
    'aggregateId', 'd2000000-0000-4000-8000-000000000001',
    'payloadSchemaVersion', 1,
    'createdAtUtc', '2026-09-20T17:59:00Z',
    'authorization', jsonb_build_object(
      'actorProfileId', 'a1000000-0000-4000-8000-000000000002',
      'permissionVersion', 1,
      'validatedAtUtc', '2026-09-20T17:00:00Z',
      'offlineValidUntilUtc', '2026-09-21T17:00:00Z',
      'stateAtCapture', 'VALID'
    ),
    'payload', jsonb_build_object(
      'schemaVersion', 1,
      'shipmentId', 'd2000000-0000-4000-8000-000000000001',
      'feedCycleId', 'd3000000-0000-4000-8000-000000000001',
      'responsibilityAssignmentId', 'd4000000-0000-4000-8000-000000000001',
      'organizationId', '30000000-0000-4000-8000-000000000001',
      'plantId', '31000000-0000-4000-8000-000000000001',
      'stationId', '34000000-0000-4000-8000-000000000001',
      'lineId', '32000000-0000-4000-8000-000000000002',
      'supplierId', '35000000-0000-4000-8000-000000000001',
      'responsibleWorkerId', 'b1000000-0000-4000-8000-000000000001',
      'actorProfileId', 'a1000000-0000-4000-8000-000000000002',
      'permissionVersion', 1,
      'occurredAtUtc', '2026-09-20T17:59:00Z'
    ),
    'precheckCode', null
  );

  update app.stations
  set is_active = false, deactivated_at = now(), updated_at = now()
  where id = '34000000-0000-4000-8000-000000000001';
  result := app.ingest_sync_item_v1(base_input);
  if result ->> 'status' <> 'FAILED_REVIEW'
     or result ->> 'code' <> 'STATION_REVOKED' then
    raise exception 'revoked station must require review: %', result;
  end if;

  update app.stations
  set is_active = true, deactivated_at = null, updated_at = now()
  where id = '34000000-0000-4000-8000-000000000001';
  update app.production_lines
  set is_active = false, deactivated_at = now(), updated_at = now()
  where id = '32000000-0000-4000-8000-000000000002';
  attempt := base_input || jsonb_build_object(
    'correlationId', 'da000000-0000-4000-8000-000000000002',
    'receiptId', 'db000000-0000-4000-8000-000000000002',
    'auditEventId', 'dc000000-0000-4000-8000-000000000002',
    'outboxMessageId', 'd1000000-0000-4000-8000-000000000002',
    'stationSequence', 102,
    'aggregateId', 'd2000000-0000-4000-8000-000000000002',
    'contentHash', repeat('2', 64),
    'payload', (base_input -> 'payload') || jsonb_build_object(
      'shipmentId', 'd2000000-0000-4000-8000-000000000002',
      'feedCycleId', 'd3000000-0000-4000-8000-000000000002',
      'responsibilityAssignmentId', 'd4000000-0000-4000-8000-000000000002'
    )
  );
  result := app.ingest_sync_item_v1(attempt);
  if result ->> 'status' <> 'FAILED_REVIEW'
     or result ->> 'code' <> 'LINE_REVOKED' then
    raise exception 'revoked line must require review: %', result;
  end if;

  update app.production_lines
  set is_active = true, deactivated_at = null, updated_at = now()
  where id = '32000000-0000-4000-8000-000000000002';
  attempt := base_input || jsonb_build_object(
    'correlationId', 'da000000-0000-4000-8000-000000000003',
    'receiptId', 'db000000-0000-4000-8000-000000000003',
    'auditEventId', 'dc000000-0000-4000-8000-000000000003',
    'outboxMessageId', 'd1000000-0000-4000-8000-000000000003',
    'stationSequence', 103,
    'aggregateId', 'd2000000-0000-4000-8000-000000000003',
    'contentHash', repeat('3', 64),
    'createdAtUtc', '2026-09-20T18:06:00Z',
    'payload', (base_input -> 'payload') || jsonb_build_object(
      'shipmentId', 'd2000000-0000-4000-8000-000000000003',
      'feedCycleId', 'd3000000-0000-4000-8000-000000000003',
      'responsibilityAssignmentId', 'd4000000-0000-4000-8000-000000000003',
      'occurredAtUtc', '2026-09-20T18:06:00Z'
    )
  );
  result := app.ingest_sync_item_v1(attempt);
  if result ->> 'status' <> 'FAILED_REVIEW'
     or result ->> 'code' <> 'CLOCK_SKEW_REVIEW' then
    raise exception 'future clock skew must require review: %', result;
  end if;

  attempt := base_input || jsonb_build_object(
    'correlationId', 'da000000-0000-4000-8000-000000000004',
    'receiptId', 'db000000-0000-4000-8000-000000000004',
    'auditEventId', 'dc000000-0000-4000-8000-000000000004',
    'outboxMessageId', 'd1000000-0000-4000-8000-000000000004',
    'stationSequence', 104,
    'aggregateId', 'd2000000-0000-4000-8000-000000000004',
    'contentHash', repeat('4', 64),
    'authorization', (base_input -> 'authorization')
      || jsonb_build_object('permissionVersion', 99),
    'payload', (base_input -> 'payload') || jsonb_build_object(
      'shipmentId', 'd2000000-0000-4000-8000-000000000004',
      'feedCycleId', 'd3000000-0000-4000-8000-000000000004',
      'responsibilityAssignmentId', 'd4000000-0000-4000-8000-000000000004'
    )
  );
  result := app.ingest_sync_item_v1(attempt);
  if result ->> 'status' <> 'FAILED_REVIEW'
     or result ->> 'code' <> 'PERMISSION_VERSION_MISMATCH' then
    raise exception 'stale permission version must require review: %', result;
  end if;

  attempt := base_input || jsonb_build_object(
    'correlationId', 'da000000-0000-4000-8000-000000000005',
    'receiptId', 'db000000-0000-4000-8000-000000000005',
    'auditEventId', 'dc000000-0000-4000-8000-000000000005',
    'outboxMessageId', 'd1000000-0000-4000-8000-000000000005',
    'stationSequence', 105,
    'aggregateId', 'd2000000-0000-4000-8000-000000000005',
    'contentHash', repeat('5', 64),
    'payload', (base_input -> 'payload') || jsonb_build_object(
      'shipmentId', 'd2000000-0000-4000-8000-000000000005',
      'feedCycleId', 'd3000000-0000-4000-8000-000000000005',
      'responsibilityAssignmentId', 'd4000000-0000-4000-8000-000000000005'
    )
  );
  result := app.ingest_sync_item_v1(attempt);
  if result ->> 'status' <> 'APPLIED' then
    raise exception 'active configuration must still apply: %', result;
  end if;

  select count(*) into production_count_after from app.production_events;
  if production_count_after <> production_count_before then
    raise exception 'conflict policy must preserve append-only production history';
  end if;

  if exists (
    select 1 from app.shipments
    where id in (
      'd2000000-0000-4000-8000-000000000001',
      'd2000000-0000-4000-8000-000000000002',
      'd2000000-0000-4000-8000-000000000003',
      'd2000000-0000-4000-8000-000000000004'
    )
  ) then
    raise exception 'reviewed conflicts must not create business effects';
  end if;

  if not exists (
    select 1 from app.shipments
    where id = 'd2000000-0000-4000-8000-000000000005'
  ) then
    raise exception 'valid item after conflicts must remain independent';
  end if;

  if (
    select count(*) from app.sync_receipts
    where outbox_message_id::text like 'd1000000-0000-4000-8000-%'
  ) <> 5 then
    raise exception 'every conflict and valid item must keep a durable receipt';
  end if;
end;
$$;
