DROP TRIGGER IF EXISTS mercury_movements_rastra_check;
DROP TRIGGER IF EXISTS mercury_movements_reject_update;
DROP TRIGGER IF EXISTS mercury_movements_reject_delete;

ALTER TABLE mercury_movements RENAME TO mercury_movements_legacy;

CREATE TABLE mercury_movements (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    station_id TEXT NOT NULL,
    line_id TEXT NOT NULL,
    feed_cycle_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    line_component_id TEXT NOT NULL,
    sweep_id TEXT,
    client_sequence INTEGER NOT NULL CHECK (client_sequence > 0),
    movement_kind TEXT NOT NULL CHECK (movement_kind IN (
        'INITIAL_LOAD', 'RELOAD', 'RECOVERY', 'SWEEP_INPUT', 'SWEEP_REMAINDER')),
    amount_centigrams INTEGER CHECK (amount_centigrams IS NULL OR amount_centigrams >= 0),
    unit_code TEXT NOT NULL DEFAULT 'g' CHECK (unit_code = 'g'),
    occurred_at_utc TEXT NOT NULL,
    recorded_at_utc TEXT NOT NULL,
    recorded_by_profile_id TEXT NOT NULL,
    supersedes_movement_id TEXT,
    notes TEXT,
    UNIQUE (organization_id, id),
    UNIQUE (organization_id, station_id, client_sequence),
    FOREIGN KEY (shipment_id, feed_cycle_id, line_id, organization_id)
        REFERENCES cached_shipments(id, feed_cycle_id, line_id, organization_id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, line_id, line_component_id)
        REFERENCES cached_line_components(organization_id, line_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, sweep_id, shipment_id, line_id, feed_cycle_id)
        REFERENCES production_sweeps(organization_id, id, shipment_id, line_id, feed_cycle_id)
        ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, supersedes_movement_id)
        REFERENCES mercury_movements(organization_id, id) ON DELETE RESTRICT,
    CHECK (
        (movement_kind IN ('RECOVERY', 'SWEEP_INPUT', 'SWEEP_REMAINDER') AND sweep_id IS NOT NULL) OR
        (movement_kind IN ('INITIAL_LOAD', 'RELOAD') AND sweep_id IS NULL)
    ),
    CHECK (recorded_at_utc >= occurred_at_utc),
    CHECK (notes IS NULL OR length(trim(notes)) > 0),
    CHECK (supersedes_movement_id IS NULL OR supersedes_movement_id <> id)
);

INSERT INTO mercury_movements(
    id, organization_id, plant_id, station_id, line_id, feed_cycle_id,
    shipment_id, line_component_id, sweep_id, client_sequence,
    movement_kind, amount_centigrams, unit_code, occurred_at_utc,
    recorded_at_utc, recorded_by_profile_id, supersedes_movement_id, notes)
SELECT id, organization_id, plant_id, station_id, line_id, feed_cycle_id,
       shipment_id, line_component_id, sweep_id, client_sequence,
       movement_kind, amount_centigrams, unit_code, occurred_at_utc,
       recorded_at_utc, recorded_by_profile_id, supersedes_movement_id, notes
FROM mercury_movements_legacy
ORDER BY client_sequence;

DROP TABLE mercury_movements_legacy;

CREATE UNIQUE INDEX ux_mercury_movements_superseded_once
    ON mercury_movements(organization_id, supersedes_movement_id)
    WHERE supersedes_movement_id IS NOT NULL;
CREATE INDEX ix_mercury_movements_shipment_component_time
    ON mercury_movements(organization_id, shipment_id, line_component_id, occurred_at_utc, id);
CREATE INDEX ix_mercury_movements_sweep
    ON mercury_movements(organization_id, sweep_id)
    WHERE sweep_id IS NOT NULL;

CREATE TRIGGER mercury_movements_rastra_check
BEFORE INSERT ON mercury_movements
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM cached_line_components AS component
        WHERE component.organization_id = NEW.organization_id
          AND component.line_id = NEW.line_id
          AND component.id = NEW.line_component_id
          AND component.component_type_code = 'RASTRA'
    ) THEN RAISE(ABORT, 'MERCURY_COMPONENT_MUST_BE_RASTRA') END;
    SELECT CASE WHEN NEW.supersedes_movement_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM mercury_movements AS previous
        WHERE previous.organization_id = NEW.organization_id
          AND previous.id = NEW.supersedes_movement_id
          AND previous.shipment_id = NEW.shipment_id
          AND previous.line_id = NEW.line_id
          AND previous.line_component_id = NEW.line_component_id
          AND previous.movement_kind = NEW.movement_kind
          AND previous.sweep_id IS NEW.sweep_id
    ) THEN RAISE(ABORT, 'MERCURY_CORRECTION_CONTEXT_MISMATCH') END;
END;

CREATE TRIGGER mercury_movements_reject_update
BEFORE UPDATE ON mercury_movements
BEGIN SELECT RAISE(ABORT, 'mercury_movements are immutable'); END;
CREATE TRIGGER mercury_movements_reject_delete
BEFORE DELETE ON mercury_movements
BEGIN SELECT RAISE(ABORT, 'mercury_movements are immutable'); END;
