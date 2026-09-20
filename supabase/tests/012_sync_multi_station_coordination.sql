-- Verifica 1 PC/4 lineas, 2 PC/2 lineas y el bloqueo durable de solapamiento.

insert into app.stations (
  id, organization_id, plant_id, code, name, device_key, permission_version
) values (
  '34000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'ESTACION_2',
  'Estacion ficticia secundaria',
  'station-demo-00000000-0000-4000-8000-000000000002',
  1
);

insert into app.station_line_scopes (
  organization_id, plant_id, station_id, production_line_id
) values
  (
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '34000000-0000-4000-8000-000000000002',
    '32000000-0000-4000-8000-000000000003'
  ),
  (
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '34000000-0000-4000-8000-000000000002',
    '32000000-0000-4000-8000-000000000004'
  );

insert into app.station_user_authorizations (
  id,
  organization_id,
  plant_id,
  station_id,
  user_profile_id,
  authorized_by_profile_id
) values (
  'a2000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001'
);

do $$
declare
  station_one_start jsonb;
  station_two_attempt jsonb;
  result jsonb;
begin
  if (
    select count(*)
    from app.station_line_scopes
    where station_id = '34000000-0000-4000-8000-000000000001'
      and is_active
  ) <> 4 then
    raise exception 'one station must keep its four explicit line assignments';
  end if;

  station_one_start := jsonb_build_object(
    'organizationId', '30000000-0000-4000-8000-000000000001',
    'plantId', '31000000-0000-4000-8000-000000000001',
    'stationId', '34000000-0000-4000-8000-000000000001',
    'batchId', 'e0000000-0000-4000-8000-000000000001',
    'clientApplication', 'desktop',
    'clientApplicationVersion', '0.1.0',
    'clientSentAtUtc', '2026-09-20T20:00:00Z',
    'correlationId', 'ea000000-0000-4000-8000-000000000001',
    'receiptId', 'eb000000-0000-4000-8000-000000000001',
    'auditEventId', 'ec000000-0000-4000-8000-000000000001',
    'processedAtUtc', '2026-09-20T20:00:02Z',
    'outboxMessageId', 'e1000000-0000-4000-8000-000000000001',
    'stationSequence', 201,
    'contentHash', repeat('6', 64),
    'operationType', 'OPERATION_STARTED',
    'aggregateType', 'shipment',
    'aggregateId', 'e2000000-0000-4000-8000-000000000001',
    'payloadSchemaVersion', 1,
    'createdAtUtc', '2026-09-20T20:00:00Z',
    'authorization', jsonb_build_object(
      'actorProfileId', 'a1000000-0000-4000-8000-000000000002',
      'permissionVersion', 1,
      'validatedAtUtc', '2026-09-20T19:00:00Z',
      'offlineValidUntilUtc', '2026-09-21T19:00:00Z',
      'stateAtCapture', 'VALID'
    ),
    'payload', jsonb_build_object(
      'schemaVersion', 1,
      'shipmentId', 'e2000000-0000-4000-8000-000000000001',
      'feedCycleId', 'e3000000-0000-4000-8000-000000000001',
      'responsibilityAssignmentId', 'e4000000-0000-4000-8000-000000000001',
      'organizationId', '30000000-0000-4000-8000-000000000001',
      'plantId', '31000000-0000-4000-8000-000000000001',
      'stationId', '34000000-0000-4000-8000-000000000001',
      'lineId', '32000000-0000-4000-8000-000000000003',
      'supplierId', '35000000-0000-4000-8000-000000000001',
      'responsibleWorkerId', 'b1000000-0000-4000-8000-000000000001',
      'actorProfileId', 'a1000000-0000-4000-8000-000000000002',
      'permissionVersion', 1,
      'occurredAtUtc', '2026-09-20T20:00:00Z'
    ),
    'precheckCode', null
  );

  result := app.ingest_sync_item_v1(station_one_start);
  if result ->> 'status' <> 'APPLIED' then
    raise exception 'station one must start its assigned third line: %', result;
  end if;

  station_two_attempt := station_one_start || jsonb_build_object(
    'stationId', '34000000-0000-4000-8000-000000000002',
    'batchId', 'e0000000-0000-4000-8000-000000000002',
    'clientApplicationVersion', '0.2.0',
    'correlationId', 'ea000000-0000-4000-8000-000000000002',
    'receiptId', 'eb000000-0000-4000-8000-000000000002',
    'auditEventId', 'ec000000-0000-4000-8000-000000000002',
    'outboxMessageId', 'e1100000-0000-4000-8000-000000000001',
    'stationSequence', 1,
    'contentHash', repeat('7', 64),
    'aggregateId', 'e2000000-0000-4000-8000-000000000002',
    'payload', (station_one_start -> 'payload') || jsonb_build_object(
      'stationId', '34000000-0000-4000-8000-000000000002',
      'shipmentId', 'e2000000-0000-4000-8000-000000000002',
      'feedCycleId', 'e3000000-0000-4000-8000-000000000002',
      'responsibilityAssignmentId', 'e4000000-0000-4000-8000-000000000002'
    )
  );
  result := app.ingest_sync_item_v1(station_two_attempt);
  if result ->> 'status' <> 'FAILED_REVIEW'
     or result ->> 'code' <> 'LINE_OPERATION_CONFLICT' then
    raise exception 'overlap on the same line must require review: %', result;
  end if;

  result := app.ingest_sync_item_v1(
    station_two_attempt || jsonb_build_object(
      'batchId', 'e0000000-0000-4000-8000-000000000003',
      'correlationId', 'ea000000-0000-4000-8000-000000000003',
      'receiptId', 'eb000000-0000-4000-8000-000000000003',
      'auditEventId', 'ec000000-0000-4000-8000-000000000003',
      'outboxMessageId', 'e1100000-0000-4000-8000-000000000002',
      'stationSequence', 2,
      'contentHash', repeat('8', 64),
      'aggregateId', 'e2000000-0000-4000-8000-000000000003',
      'payload', (station_two_attempt -> 'payload') || jsonb_build_object(
        'lineId', '32000000-0000-4000-8000-000000000004',
        'shipmentId', 'e2000000-0000-4000-8000-000000000003',
        'feedCycleId', 'e3000000-0000-4000-8000-000000000003',
        'responsibilityAssignmentId', 'e4000000-0000-4000-8000-000000000003'
      )
    )
  );
  if result ->> 'status' <> 'APPLIED' then
    raise exception 'two stations must operate different assigned lines: %', result;
  end if;

  result := app.ingest_sync_item_v1(
    station_one_start || jsonb_build_object(
      'batchId', 'e0000000-0000-4000-8000-000000000004',
      'correlationId', 'ea000000-0000-4000-8000-000000000004',
      'receiptId', 'eb000000-0000-4000-8000-000000000004',
      'auditEventId', 'ec000000-0000-4000-8000-000000000004',
      'outboxMessageId', 'e1000000-0000-4000-8000-000000000002',
      'stationSequence', 202,
      'contentHash', repeat('9', 64),
      'operationType', 'OPERATION_COMPLETED',
      'payload', jsonb_build_object(
        'schemaVersion', 1,
        'shipmentId', 'e2000000-0000-4000-8000-000000000001',
        'feedCycleId', 'e3000000-0000-4000-8000-000000000001',
        'organizationId', '30000000-0000-4000-8000-000000000001',
        'plantId', '31000000-0000-4000-8000-000000000001',
        'stationId', '34000000-0000-4000-8000-000000000001',
        'lineId', '32000000-0000-4000-8000-000000000003',
        'responsibleWorkerId', 'b1000000-0000-4000-8000-000000000001',
        'actorProfileId', 'a1000000-0000-4000-8000-000000000002',
        'permissionVersion', 1,
        'occurredAtUtc', '2026-09-20T20:01:00Z'
      )
    )
  );
  if result ->> 'status' <> 'APPLIED' then
    raise exception 'the first station must release its line normally: %', result;
  end if;

  result := app.ingest_sync_item_v1(
    station_two_attempt || jsonb_build_object(
      'batchId', 'e0000000-0000-4000-8000-000000000005',
      'correlationId', 'ea000000-0000-4000-8000-000000000005',
      'receiptId', 'eb000000-0000-4000-8000-000000000005',
      'auditEventId', 'ec000000-0000-4000-8000-000000000005',
      'outboxMessageId', 'e1100000-0000-4000-8000-000000000003',
      'stationSequence', 3,
      'contentHash', repeat('a', 64),
      'aggregateId', 'e2000000-0000-4000-8000-000000000004',
      'createdAtUtc', '2026-09-20T20:02:00Z',
      'processedAtUtc', '2026-09-20T20:02:02Z',
      'clientSentAtUtc', '2026-09-20T20:02:00Z',
      'payload', (station_two_attempt -> 'payload') || jsonb_build_object(
        'shipmentId', 'e2000000-0000-4000-8000-000000000004',
        'feedCycleId', 'e3000000-0000-4000-8000-000000000004',
        'responsibilityAssignmentId', 'e4000000-0000-4000-8000-000000000004',
        'occurredAtUtc', '2026-09-20T20:02:00Z'
      )
    )
  );
  if result ->> 'status' <> 'APPLIED' then
    raise exception 'the second station must start after the line is released: %', result;
  end if;

  if (select count(*) from app.sync_clients) <> 2 then
    raise exception 'both stations must be registered as sync clients';
  end if;
  if not exists (
    select 1
    from app.sync_clients
    where station_id = '34000000-0000-4000-8000-000000000002'
      and application = 'desktop'
      and application_version = '0.2.0'
      and last_batch_id = 'e0000000-0000-4000-8000-000000000005'
      and last_clock_skew_seconds = 2
  ) then
    raise exception 'client telemetry must retain version, last batch and clock skew';
  end if;

  if exists (
    select 1
    from app.shipments
    where id = 'e2000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'the overlapping rejected shipment must have no business effect';
  end if;
end;
$$;

set role authenticated;
do $$
begin
  begin
    perform 1 from app.sync_clients limit 1;
    raise exception 'authenticated must not read private sync clients directly';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
