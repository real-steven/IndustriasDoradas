CREATE TABLE outbox_messages_v2 (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    station_sequence INTEGER NOT NULL CHECK (station_sequence > 0),
    operation_type TEXT NOT NULL CHECK (length(trim(operation_type)) > 0),
    aggregate_type TEXT NOT NULL CHECK (length(trim(aggregate_type)) > 0),
    aggregate_id TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    state TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (state IN ('PENDING', 'SYNCING', 'SYNCED', 'FAILED_REVIEW')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at_utc TEXT,
    claim_id TEXT,
    claimed_at_utc TEXT,
    lease_until_utc TEXT,
    actor_profile_id TEXT,
    permission_version INTEGER CHECK (permission_version IS NULL OR permission_version > 0),
    authorization_validated_at_utc TEXT,
    authorization_offline_until_utc TEXT,
    authorization_state TEXT CHECK (
        authorization_state IS NULL OR
        authorization_state IN ('VALID', 'EXPIRED_CONTINGENCY', 'LEGACY_UNAVAILABLE')),
    last_error_code TEXT,
    last_http_status INTEGER,
    synced_at_utc TEXT,
    central_receipt_id TEXT,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    UNIQUE (station_id, station_sequence),
    CHECK (
        (state = 'SYNCING' AND claim_id IS NOT NULL AND claimed_at_utc IS NOT NULL AND lease_until_utc IS NOT NULL) OR
        (state <> 'SYNCING' AND claim_id IS NULL AND claimed_at_utc IS NULL AND lease_until_utc IS NULL)
    ),
    CHECK (
        (state = 'SYNCED' AND synced_at_utc IS NOT NULL) OR
        state <> 'SYNCED'
    )
);

INSERT INTO outbox_messages_v2(
    id, station_id, station_sequence, operation_type, aggregate_type,
    aggregate_id, payload_json, state, attempt_count, next_attempt_at_utc,
    last_error_code, synced_at_utc, central_receipt_id, created_at_utc, updated_at_utc)
SELECT
    id,
    json_extract(payload_json, '$.stationId'),
    ROW_NUMBER() OVER (ORDER BY created_at_utc, id),
    operation_type,
    aggregate_type,
    aggregate_id,
    payload_json,
    CASE state
        WHEN 'CONFIRMED' THEN 'SYNCED'
        ELSE 'PENDING'
    END,
    attempt_count,
    CASE WHEN state = 'CONFIRMED' THEN NULL ELSE next_attempt_at_utc END,
    CASE WHEN state = 'FAILED' THEN last_error ELSE NULL END,
    CASE WHEN state = 'CONFIRMED' THEN updated_at_utc ELSE NULL END,
    NULL,
    created_at_utc,
    updated_at_utc
FROM outbox_messages;

DROP TABLE outbox_messages;
ALTER TABLE outbox_messages_v2 RENAME TO outbox_messages;

CREATE INDEX ix_outbox_pending
    ON outbox_messages(state, next_attempt_at_utc, station_sequence);

CREATE INDEX ix_outbox_lease
    ON outbox_messages(state, lease_until_utc);
