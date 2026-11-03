CREATE TABLE outbox_review_decisions (
    id TEXT PRIMARY KEY NOT NULL,
    outbox_message_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('RETRY_REQUESTED', 'DISCARDED')),
    previous_error_code TEXT,
    previous_attempt_count INTEGER NOT NULL,
    decided_at_utc TEXT NOT NULL
);

CREATE INDEX ix_outbox_review_decisions_message_time
    ON outbox_review_decisions(outbox_message_id, decided_at_utc DESC);

-- Las dependencias transitorias tienen tiempo suficiente para llegar. Después de
-- diez intentos dejan de consumir la cola y requieren una decisión humana.
UPDATE outbox_messages
SET state = 'FAILED_REVIEW',
    claim_id = NULL,
    claimed_at_utc = NULL,
    lease_until_utc = NULL,
    next_attempt_at_utc = NULL,
    last_error_code = 'ORPHANED_DEPENDENCY',
    updated_at_utc = CURRENT_TIMESTAMP
WHERE state IN ('PENDING', 'SYNCING')
  AND last_error_code = 'DEPENDENCY_NOT_READY'
  AND attempt_count >= 10;
