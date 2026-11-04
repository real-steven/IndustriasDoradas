-- A multi-client projection used 63-bit hashes for remote rows. Older local
-- allocators then reused the largest projected value in new JSON payloads.
-- JavaScript cannot represent those values exactly, so the API rejected them.
-- Keep append-only local facts unchanged and repair only their unsent envelope.

UPDATE outbox_messages
SET payload_json = json_set(payload_json, '$.clientSequence', station_sequence),
    state = 'PENDING',
    attempt_count = 0,
    next_attempt_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    claim_id = NULL,
    claimed_at_utc = NULL,
    lease_until_utc = NULL,
    last_error_code = NULL,
    central_receipt_id = NULL,
    updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE state = 'FAILED_REVIEW'
  AND last_error_code = 'INVALID_EVENT'
  AND station_sequence BETWEEN 1 AND 9007199254740991
  AND json_type(payload_json, '$.clientSequence') = 'integer'
  AND json_extract(payload_json, '$.clientSequence') > 9007199254740991;
