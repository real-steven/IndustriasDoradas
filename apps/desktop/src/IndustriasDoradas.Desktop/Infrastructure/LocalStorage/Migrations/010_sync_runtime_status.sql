CREATE TABLE sync_runtime_status (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    network_state TEXT NOT NULL CHECK (network_state IN ('UNKNOWN', 'AVAILABLE', 'UNAVAILABLE')),
    last_attempt_at_utc TEXT NOT NULL,
    last_success_at_utc TEXT,
    last_error_code TEXT
);
