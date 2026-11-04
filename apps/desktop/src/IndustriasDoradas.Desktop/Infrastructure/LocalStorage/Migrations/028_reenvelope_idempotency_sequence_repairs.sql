-- Migration 027 corrected the unsafe JSON clientSequence of rejected events.
-- Reusing the same outbox id after changing its content correctly triggered
-- IDEMPOTENCY_CONTENT_MISMATCH. Give only those known repairs a fresh envelope
-- while preserving the immutable production event and its clientEventId.

CREATE TABLE outbox_recovery_envelopes (
    id TEXT PRIMARY KEY,
    old_outbox_message_id TEXT NOT NULL UNIQUE,
    new_outbox_message_id TEXT NOT NULL UNIQUE,
    station_id TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    old_station_sequence INTEGER NOT NULL CHECK (old_station_sequence > 0),
    new_station_sequence INTEGER NOT NULL CHECK (new_station_sequence > 0),
    old_central_receipt_id TEXT NOT NULL,
    recovery_reason TEXT NOT NULL,
    recovered_at_utc TEXT NOT NULL,
    CHECK (old_outbox_message_id <> new_outbox_message_id),
    CHECK (old_station_sequence <> new_station_sequence)
);

CREATE INDEX ix_outbox_recovery_envelopes_aggregate
    ON outbox_recovery_envelopes(aggregate_type, aggregate_id);

CREATE TEMP TABLE idempotency_recovery_map (
    old_outbox_message_id TEXT PRIMARY KEY,
    new_outbox_message_id TEXT NOT NULL UNIQUE,
    station_id TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    old_station_sequence INTEGER NOT NULL,
    new_station_sequence INTEGER NOT NULL
        CHECK (new_station_sequence BETWEEN 1 AND 9007199254740991),
    old_central_receipt_id TEXT NOT NULL
);

WITH eligible AS (
    SELECT message.id,
           message.station_id,
           message.aggregate_type,
           message.aggregate_id,
           message.station_sequence,
           message.central_receipt_id,
           ROW_NUMBER() OVER (
               PARTITION BY message.station_id
               ORDER BY message.station_sequence, message.id
           ) AS recovery_offset
    FROM outbox_messages AS message
    WHERE message.state = 'FAILED_REVIEW'
      AND message.last_error_code = 'IDEMPOTENCY_CONTENT_MISMATCH'
      AND message.operation_type = 'PRODUCTION_EVENT_CREATED'
      AND message.aggregate_type = 'production_event'
      AND message.central_receipt_id IS NOT NULL
      AND json_type(message.payload_json, '$.clientSequence') = 'integer'
      AND json_extract(message.payload_json, '$.clientSequence') = message.station_sequence
      AND json_extract(message.payload_json, '$.clientEventId') = message.aggregate_id
      AND EXISTS (
          SELECT 1
          FROM production_events AS event
          WHERE event.client_event_id = message.aggregate_id
      )
      AND NOT EXISTS (
          SELECT 1
          FROM outbox_messages AS applied
          WHERE applied.aggregate_id = message.aggregate_id
            AND applied.state = 'SYNCED'
      )
),
station_bases AS (
    SELECT eligible.station_id,
           MAX(
               COALESCE((
                   SELECT MAX(existing.station_sequence) + 1
                   FROM outbox_messages AS existing
                   WHERE existing.station_id = eligible.station_id
               ), 1),
               COALESCE((
                   SELECT sequence.next_sequence
                   FROM station_sequence_state AS sequence
                   WHERE sequence.station_id = eligible.station_id
               ), 1)
           ) AS first_sequence
    FROM eligible
    GROUP BY eligible.station_id
),
seeded AS MATERIALIZED (
    SELECT eligible.*,
           station_bases.first_sequence + eligible.recovery_offset - 1 AS new_sequence,
           lower(hex(randomblob(16))) AS random_hex
    FROM eligible
    JOIN station_bases ON station_bases.station_id = eligible.station_id
)
INSERT INTO idempotency_recovery_map(
    old_outbox_message_id, new_outbox_message_id, station_id,
    aggregate_type, aggregate_id, old_station_sequence,
    new_station_sequence, old_central_receipt_id)
SELECT id,
       substr(random_hex, 1, 8) || '-' ||
       substr(random_hex, 9, 4) || '-4' ||
       substr(random_hex, 14, 3) || '-8' ||
       substr(random_hex, 18, 3) || '-' ||
       substr(random_hex, 21, 12),
       station_id, aggregate_type, aggregate_id, station_sequence,
       new_sequence, central_receipt_id
FROM seeded;

INSERT INTO outbox_recovery_envelopes(
    id, old_outbox_message_id, new_outbox_message_id, station_id,
    aggregate_type, aggregate_id, old_station_sequence,
    new_station_sequence, old_central_receipt_id,
    recovery_reason, recovered_at_utc)
SELECT lower(hex(randomblob(16))),
       old_outbox_message_id, new_outbox_message_id, station_id,
       aggregate_type, aggregate_id, old_station_sequence,
       new_station_sequence, old_central_receipt_id,
       'UNSAFE_CLIENT_SEQUENCE_REENVELOPE',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM idempotency_recovery_map;

UPDATE outbox_messages AS message
SET id = (
        SELECT recovery.new_outbox_message_id
        FROM idempotency_recovery_map AS recovery
        WHERE recovery.old_outbox_message_id = message.id
    ),
    station_sequence = (
        SELECT recovery.new_station_sequence
        FROM idempotency_recovery_map AS recovery
        WHERE recovery.old_outbox_message_id = message.id
    ),
    payload_json = json_set(
        message.payload_json,
        '$.clientSequence',
        (
            SELECT recovery.new_station_sequence
            FROM idempotency_recovery_map AS recovery
            WHERE recovery.old_outbox_message_id = message.id
        )),
    state = 'PENDING',
    attempt_count = 0,
    next_attempt_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    claim_id = NULL,
    claimed_at_utc = NULL,
    lease_until_utc = NULL,
    last_error_code = NULL,
    last_http_status = NULL,
    synced_at_utc = NULL,
    central_receipt_id = NULL,
    updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE message.id IN (
    SELECT recovery.old_outbox_message_id
    FROM idempotency_recovery_map AS recovery
);

INSERT INTO station_sequence_state(station_id, next_sequence, updated_at_utc)
SELECT station_id,
       MAX(new_station_sequence) + 1,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM idempotency_recovery_map
GROUP BY station_id
ON CONFLICT(station_id) DO UPDATE SET
    next_sequence = MAX(station_sequence_state.next_sequence, excluded.next_sequence),
    updated_at_utc = excluded.updated_at_utc;

DROP TABLE idempotency_recovery_map;
