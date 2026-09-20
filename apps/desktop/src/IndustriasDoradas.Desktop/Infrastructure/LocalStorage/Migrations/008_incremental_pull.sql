CREATE TABLE sync_pull_state (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    cursor TEXT,
    updated_at_utc TEXT NOT NULL
);

CREATE TABLE sync_entity_cache (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_version INTEGER NOT NULL CHECK (entity_version > 0),
    action TEXT NOT NULL CHECK (action IN ('UPSERT', 'DEACTIVATE', 'CORRECTION_APPENDED')),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    payload_hash TEXT NOT NULL,
    changed_at_utc TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE sync_applied_changes (
    change_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_version INTEGER NOT NULL CHECK (entity_version > 0),
    payload_hash TEXT NOT NULL,
    applied_at_utc TEXT NOT NULL
);

CREATE TABLE sync_pull_reviews (
    change_id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    detected_at_utc TEXT NOT NULL
);

CREATE INDEX ix_sync_entity_cache_version
    ON sync_entity_cache(entity_type, entity_id, entity_version);
