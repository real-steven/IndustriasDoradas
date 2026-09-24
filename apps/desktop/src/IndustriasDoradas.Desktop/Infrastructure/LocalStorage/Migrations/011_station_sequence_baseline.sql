CREATE TABLE station_sequence_state (
    station_id TEXT PRIMARY KEY,
    next_sequence INTEGER NOT NULL CHECK (next_sequence > 0),
    updated_at_utc TEXT NOT NULL
);
