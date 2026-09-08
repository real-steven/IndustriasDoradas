CREATE UNIQUE INDEX ux_production_events_single_reversal
    ON production_events(reverses_client_event_id)
    WHERE event_type = 'CAJUELA_REVERSED';

CREATE INDEX ix_production_events_latest_added
    ON production_events(line_id, shipment_id, event_type, client_sequence DESC);

CREATE TABLE production_event_corrections (
    reversal_client_event_id TEXT PRIMARY KEY,
    target_client_event_id TEXT NOT NULL UNIQUE,
    confirmation_id TEXT NOT NULL UNIQUE,
    reason_code TEXT NOT NULL CHECK (reason_code = 'IMMEDIATE_INPUT_ERROR'),
    prepared_at_utc TEXT NOT NULL,
    confirmed_at_utc TEXT NOT NULL,
    FOREIGN KEY (reversal_client_event_id)
        REFERENCES production_events(client_event_id) ON DELETE RESTRICT,
    FOREIGN KEY (target_client_event_id)
        REFERENCES production_events(client_event_id) ON DELETE RESTRICT,
    CHECK (confirmed_at_utc >= prepared_at_utc)
);

CREATE TRIGGER production_event_corrections_reject_update
BEFORE UPDATE ON production_event_corrections
BEGIN
    SELECT RAISE(ABORT, 'production_event_corrections are immutable');
END;

CREATE TRIGGER production_event_corrections_reject_delete
BEFORE DELETE ON production_event_corrections
BEGIN
    SELECT RAISE(ABORT, 'production_event_corrections are immutable');
END;
