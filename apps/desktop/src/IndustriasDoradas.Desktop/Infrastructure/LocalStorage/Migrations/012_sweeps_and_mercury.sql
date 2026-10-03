CREATE TABLE cached_line_components (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    line_id TEXT NOT NULL,
    component_type_code TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    display_order INTEGER NOT NULL CHECK (display_order > 0),
    is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
    updated_at_utc TEXT NOT NULL,
    UNIQUE (organization_id, line_id, id),
    UNIQUE (organization_id, line_id, code),
    FOREIGN KEY (line_id) REFERENCES cached_production_lines(id) ON DELETE RESTRICT,
    CHECK (length(trim(component_type_code)) > 0),
    CHECK (length(trim(code)) > 0),
    CHECK (length(trim(name)) > 0)
);

CREATE INDEX ix_cached_line_components_active
    ON cached_line_components(organization_id, line_id, component_type_code, is_active, display_order);

CREATE TABLE production_sweeps (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    station_id TEXT NOT NULL,
    line_id TEXT NOT NULL,
    feed_cycle_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    client_sequence INTEGER NOT NULL CHECK (client_sequence > 0),
    cajuela_count INTEGER NOT NULL CHECK (cajuela_count > 0),
    swept_at_utc TEXT NOT NULL,
    recorded_at_utc TEXT NOT NULL,
    recorded_by_profile_id TEXT NOT NULL,
    is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0, 1)),
    notes TEXT,
    UNIQUE (organization_id, id, shipment_id, line_id, feed_cycle_id),
    UNIQUE (organization_id, station_id, client_sequence),
    FOREIGN KEY (shipment_id, feed_cycle_id, line_id, organization_id)
        REFERENCES cached_shipments(id, feed_cycle_id, line_id, organization_id) ON DELETE RESTRICT,
    CHECK (recorded_at_utc >= swept_at_utc),
    CHECK (notes IS NULL OR length(trim(notes)) > 0)
);

CREATE UNIQUE INDEX ux_production_sweeps_final_per_shipment
    ON production_sweeps(organization_id, shipment_id)
    WHERE is_final = 1;
CREATE INDEX ix_production_sweeps_shipment_time
    ON production_sweeps(organization_id, shipment_id, swept_at_utc, id);
CREATE INDEX ix_production_sweeps_line_time
    ON production_sweeps(organization_id, line_id, swept_at_utc, id);

CREATE TABLE sweep_production_events (
    organization_id TEXT NOT NULL,
    sweep_id TEXT NOT NULL,
    production_event_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    line_id TEXT NOT NULL,
    feed_cycle_id TEXT NOT NULL,
    PRIMARY KEY (organization_id, sweep_id, production_event_id),
    UNIQUE (organization_id, production_event_id),
    FOREIGN KEY (organization_id, sweep_id, shipment_id, line_id, feed_cycle_id)
        REFERENCES production_sweeps(organization_id, id, shipment_id, line_id, feed_cycle_id)
        ON DELETE RESTRICT,
    FOREIGN KEY (production_event_id) REFERENCES production_events(client_event_id) ON DELETE RESTRICT
);

CREATE TRIGGER sweep_production_events_context_check
BEFORE INSERT ON sweep_production_events
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM production_events AS event
        WHERE event.client_event_id = NEW.production_event_id
          AND event.organization_id = NEW.organization_id
          AND event.shipment_id = NEW.shipment_id
          AND event.line_id = NEW.line_id
          AND event.feed_cycle_id = NEW.feed_cycle_id
    ) THEN RAISE(ABORT, 'SWEEP_EVENT_CONTEXT_MISMATCH') END;
END;

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
    movement_kind TEXT NOT NULL CHECK (movement_kind IN ('INITIAL_LOAD', 'RELOAD', 'RECOVERY')),
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
        (movement_kind = 'RECOVERY' AND sweep_id IS NOT NULL) OR
        (movement_kind IN ('INITIAL_LOAD', 'RELOAD') AND sweep_id IS NULL)
    ),
    CHECK (recorded_at_utc >= occurred_at_utc),
    CHECK (notes IS NULL OR length(trim(notes)) > 0),
    CHECK (supersedes_movement_id IS NULL OR supersedes_movement_id <> id)
);

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

CREATE TRIGGER production_sweeps_reject_update
BEFORE UPDATE ON production_sweeps
BEGIN SELECT RAISE(ABORT, 'production_sweeps are immutable'); END;
CREATE TRIGGER production_sweeps_reject_delete
BEFORE DELETE ON production_sweeps
BEGIN SELECT RAISE(ABORT, 'production_sweeps are immutable'); END;
CREATE TRIGGER sweep_production_events_reject_update
BEFORE UPDATE ON sweep_production_events
BEGIN SELECT RAISE(ABORT, 'sweep_production_events are immutable'); END;
CREATE TRIGGER sweep_production_events_reject_delete
BEFORE DELETE ON sweep_production_events
BEGIN SELECT RAISE(ABORT, 'sweep_production_events are immutable'); END;
CREATE TRIGGER mercury_movements_reject_update
BEFORE UPDATE ON mercury_movements
BEGIN SELECT RAISE(ABORT, 'mercury_movements are immutable'); END;
CREATE TRIGGER mercury_movements_reject_delete
BEFORE DELETE ON mercury_movements
BEGIN SELECT RAISE(ABORT, 'mercury_movements are immutable'); END;
