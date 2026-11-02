ALTER TABLE cached_shipments ADD COLUMN plant_id TEXT;
ALTER TABLE cached_shipments ADD COLUMN station_id TEXT;
ALTER TABLE cached_shipments ADD COLUMN is_centrally_confirmed INTEGER NOT NULL DEFAULT 0
    CHECK (is_centrally_confirmed IN (0, 1));

UPDATE cached_shipments
SET plant_id = (
        SELECT json_extract(cache.payload_json, '$.plant_id')
        FROM sync_entity_cache AS cache
        WHERE cache.entity_type = 'SHIPMENT'
          AND cache.entity_id = cached_shipments.id),
    station_id = (
        SELECT json_extract(cache.payload_json, '$.station_id')
        FROM sync_entity_cache AS cache
        WHERE cache.entity_type = 'SHIPMENT'
          AND cache.entity_id = cached_shipments.id),
    is_centrally_confirmed = 1
WHERE EXISTS (
    SELECT 1
    FROM sync_entity_cache AS cache
    WHERE cache.entity_type = 'SHIPMENT'
      AND cache.entity_id = cached_shipments.id
      AND cache.action = 'UPSERT');

CREATE INDEX ix_cached_shipments_central_operation
    ON cached_shipments(station_id, line_id, status, is_centrally_confirmed);
