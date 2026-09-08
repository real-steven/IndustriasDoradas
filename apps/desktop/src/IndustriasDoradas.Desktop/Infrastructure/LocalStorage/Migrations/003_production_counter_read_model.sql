CREATE TABLE production_counters (
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    line_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    feed_cycle_id TEXT NOT NULL,
    total INTEGER NOT NULL CHECK (total >= 0),
    updated_at_utc TEXT NOT NULL,
    PRIMARY KEY (line_id, shipment_id),
    FOREIGN KEY (shipment_id, feed_cycle_id, line_id, organization_id)
        REFERENCES cached_shipments(id, feed_cycle_id, line_id, organization_id) ON DELETE RESTRICT
);

INSERT INTO production_counters(
    organization_id, plant_id, line_id, shipment_id, feed_cycle_id, total, updated_at_utc)
SELECT
    organization_id,
    plant_id,
    line_id,
    shipment_id,
    feed_cycle_id,
    SUM(CASE event_type WHEN 'CAJUELA_ADDED' THEN 1 ELSE -1 END),
    MAX(recorded_at_utc)
FROM production_events
GROUP BY organization_id, plant_id, line_id, shipment_id, feed_cycle_id;
