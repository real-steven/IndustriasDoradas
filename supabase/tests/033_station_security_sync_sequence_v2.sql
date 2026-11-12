-- Los eventos de seguridad reciben la secuencia técnica central (v2) y conservan
-- su número local como client_sequence, igual que el resto de operaciones.

reset role;

do $$
declare
  expected_sequence bigint;
  ingest_result jsonb;
  receipt record;
begin
  if has_function_privilege('anon', 'app.ingest_station_security_sync_item_v2(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'app.ingest_station_security_sync_item_v2(jsonb)', 'execute') then
    raise exception 'station security ingestion v2 must be backend-only';
  end if;
  if not has_function_privilege('service_role', 'app.ingest_station_security_sync_item_v2(jsonb)', 'execute') then
    raise exception 'service_role must ingest station security events through v2';
  end if;

  -- Asegura que la próxima secuencia técnica no coincida con el número local.
  perform pg_catalog.setval(
    'app.sync_receipt_storage_sequence_v2',
    greatest(
      coalesce((select max(station_sequence) from app.sync_receipts), 0) + 1,
      (select case when is_called then last_value + 1 else last_value end
       from app.sync_receipt_storage_sequence_v2)
    ),
    false
  );
  select case when is_called then last_value + 1 else last_value end
    into expected_sequence
  from app.sync_receipt_storage_sequence_v2;

  ingest_result := app.ingest_station_security_sync_item_v2(jsonb_build_object(
    'organizationId', '30000000-0000-4000-8000-000000000001',
    'plantId', '31000000-0000-4000-8000-000000000001',
    'stationId', '34000000-0000-4000-8000-000000000001',
    'correlationId', '7f000000-0000-4000-8000-000000000001',
    'clientApplication', 'desktop',
    'clientApplicationVersion', '0.1.0',
    'clientSentAtUtc', '2026-11-11T18:00:00Z',
    'processedAtUtc', '2026-11-11T18:00:01Z',
    'operationType', 'SECURITY_EVENT_RECORDED',
    'aggregateType', 'station_security_event',
    'payloadSchemaVersion', 1,
    'precheckCode', null,
    'outboxMessageId', '7f100000-0000-4000-8000-000000000001',
    'stationSequence', 7,
    'contentHash', repeat('d', 64),
    'aggregateId', '7f200000-0000-4000-8000-000000000001',
    'receiptId', '7f300000-0000-4000-8000-000000000001',
    'auditEventId', '7f400000-0000-4000-8000-000000000001',
    'createdAtUtc', '2026-11-11T17:59:00Z',
    'payload', jsonb_build_object(
      'schemaVersion', 1,
      'eventId', '7f200000-0000-4000-8000-000000000001',
      'stationId', '34000000-0000-4000-8000-000000000001',
      'clientSequence', 7,
      'actorProfileId', 'a1000000-0000-4000-8000-000000000002',
      'eventType', 'ELEVATION_ACCEPTED',
      'method', 'PIN',
      'result', 'ACEPTADO',
      'occurredAtUtc', '2026-11-11T17:59:00Z'
    )
  ));

  if ingest_result ->> 'status' <> 'APPLIED'
     or (ingest_result ->> 'stationSequence')::bigint <> 7 then
    raise exception 'security event v2 must apply and echo the local sequence: %',
      ingest_result;
  end if;

  select station_sequence, client_sequence into receipt
  from app.sync_receipts
  where outbox_message_id = '7f100000-0000-4000-8000-000000000001';
  if receipt.client_sequence <> 7 or receipt.station_sequence <> expected_sequence then
    raise exception 'security receipt must use the central storage sequence, got % / %',
      receipt.station_sequence, receipt.client_sequence;
  end if;
end;
$$;
