CREATE TABLE operation_input_metrics (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL CHECK (length(trim(action)) > 0),
    source_kind TEXT NOT NULL CHECK (length(trim(source_kind)) > 0),
    outcome TEXT NOT NULL CHECK (outcome IN ('ACCEPTED', 'SUPPRESSED', 'UNAVAILABLE', 'FAILED')),
    latency_ms REAL NOT NULL CHECK (latency_ms >= 0 AND latency_ms <= 60000),
    input_interval_ms REAL CHECK (
        input_interval_ms IS NULL OR
        (input_interval_ms >= 0 AND input_interval_ms <= 60000)),
    was_repeat INTEGER NOT NULL CHECK (was_repeat IN (0, 1)),
    error_code TEXT CHECK (error_code IS NULL OR length(trim(error_code)) > 0),
    occurred_at_utc TEXT NOT NULL,
    recorded_at_utc TEXT NOT NULL,
    CHECK (recorded_at_utc >= occurred_at_utc)
);

CREATE INDEX ix_operation_input_metrics_recent
    ON operation_input_metrics(recorded_at_utc DESC, id DESC);

CREATE TRIGGER operation_input_metrics_reject_update
BEFORE UPDATE ON operation_input_metrics
BEGIN
    SELECT RAISE(ABORT, 'operation_input_metrics are immutable');
END;

CREATE TRIGGER operation_input_metrics_reject_delete
BEFORE DELETE ON operation_input_metrics
BEGIN
    SELECT RAISE(ABORT, 'operation_input_metrics are immutable');
END;
