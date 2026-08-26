CREATE TABLE cached_suppliers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
    updated_at_utc TEXT NOT NULL
);

CREATE TABLE cached_workers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
    updated_at_utc TEXT NOT NULL
);

CREATE TABLE cached_production_lines (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
    updated_at_utc TEXT NOT NULL
);

CREATE TABLE cached_shipments (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    line_id TEXT NOT NULL,
    feed_cycle_id TEXT NOT NULL UNIQUE,
    started_at_utc TEXT NOT NULL,
    completed_at_utc TEXT,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED')),
    UNIQUE (id, feed_cycle_id, line_id, organization_id),
    FOREIGN KEY (supplier_id) REFERENCES cached_suppliers(id) ON DELETE RESTRICT,
    FOREIGN KEY (line_id) REFERENCES cached_production_lines(id) ON DELETE RESTRICT,
    CHECK (
        (status = 'ACTIVE' AND completed_at_utc IS NULL) OR
        (status = 'COMPLETED' AND completed_at_utc IS NOT NULL)
    )
);

CREATE TABLE responsibility_assignments (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    line_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    feed_cycle_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    assigned_at_utc TEXT NOT NULL,
    unassigned_at_utc TEXT,
    FOREIGN KEY (shipment_id, feed_cycle_id, line_id, organization_id)
        REFERENCES cached_shipments(id, feed_cycle_id, line_id, organization_id) ON DELETE RESTRICT,
    FOREIGN KEY (worker_id) REFERENCES cached_workers(id) ON DELETE RESTRICT,
    CHECK (unassigned_at_utc IS NULL OR unassigned_at_utc >= assigned_at_utc)
);

CREATE TABLE operational_sessions (
    station_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    line_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    feed_cycle_id TEXT NOT NULL,
    responsible_worker_id TEXT NOT NULL,
    started_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED')),
    FOREIGN KEY (shipment_id, feed_cycle_id, line_id, organization_id)
        REFERENCES cached_shipments(id, feed_cycle_id, line_id, organization_id) ON DELETE RESTRICT,
    FOREIGN KEY (responsible_worker_id) REFERENCES cached_workers(id) ON DELETE RESTRICT
);

CREATE TABLE production_events (
    client_event_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    station_id TEXT NOT NULL,
    line_id TEXT NOT NULL,
    feed_cycle_id TEXT NOT NULL,
    shipment_id TEXT NOT NULL,
    responsible_worker_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('CAJUELA_ADDED', 'CAJUELA_REVERSED')),
    work_period TEXT NOT NULL CHECK (work_period IN ('DAY', 'NIGHT')),
    occurred_at_utc TEXT NOT NULL,
    recorded_at_utc TEXT NOT NULL,
    client_sequence INTEGER NOT NULL CHECK (client_sequence > 0),
    reverses_client_event_id TEXT,
    UNIQUE (station_id, client_sequence),
    FOREIGN KEY (shipment_id, feed_cycle_id, line_id, organization_id)
        REFERENCES cached_shipments(id, feed_cycle_id, line_id, organization_id) ON DELETE RESTRICT,
    FOREIGN KEY (responsible_worker_id) REFERENCES cached_workers(id) ON DELETE RESTRICT,
    FOREIGN KEY (reverses_client_event_id) REFERENCES production_events(client_event_id) ON DELETE RESTRICT,
    CHECK (
        (event_type = 'CAJUELA_ADDED' AND reverses_client_event_id IS NULL) OR
        (event_type = 'CAJUELA_REVERSED' AND reverses_client_event_id IS NOT NULL)
    ),
    CHECK (reverses_client_event_id IS NULL OR reverses_client_event_id <> client_event_id)
);

CREATE TABLE outbox_messages (
    id TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL CHECK (length(trim(operation_type)) > 0),
    aggregate_type TEXT NOT NULL CHECK (length(trim(aggregate_type)) > 0),
    aggregate_id TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    state TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (state IN ('PENDING', 'IN_FLIGHT', 'CONFIRMED', 'FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at_utc TEXT,
    last_error TEXT,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL
);
