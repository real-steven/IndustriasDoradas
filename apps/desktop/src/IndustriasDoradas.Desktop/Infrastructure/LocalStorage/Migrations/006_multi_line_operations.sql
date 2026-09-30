CREATE TABLE operational_sessions_v2 (
    station_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    line_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    feed_cycle_id TEXT NOT NULL,
    responsible_worker_id TEXT NOT NULL,
    started_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED')),
    PRIMARY KEY (station_id, line_id),
    FOREIGN KEY (shipment_id, feed_cycle_id, line_id, organization_id)
        REFERENCES cached_shipments(id, feed_cycle_id, line_id, organization_id) ON DELETE RESTRICT,
    FOREIGN KEY (responsible_worker_id) REFERENCES cached_workers(id) ON DELETE RESTRICT
);

INSERT INTO operational_sessions_v2(
    station_id, organization_id, plant_id, line_id, shipment_id,
    feed_cycle_id, responsible_worker_id, started_at_utc, updated_at_utc, status)
SELECT station_id, organization_id, plant_id, line_id, shipment_id,
       feed_cycle_id, responsible_worker_id, started_at_utc, updated_at_utc, status
FROM operational_sessions;

DROP TABLE operational_sessions;
ALTER TABLE operational_sessions_v2 RENAME TO operational_sessions;

CREATE UNIQUE INDEX ux_operational_sessions_active_line
    ON operational_sessions(line_id)
    WHERE status = 'ACTIVE';

CREATE INDEX ix_operational_sessions_station_status
    ON operational_sessions(station_id, status, line_id);
