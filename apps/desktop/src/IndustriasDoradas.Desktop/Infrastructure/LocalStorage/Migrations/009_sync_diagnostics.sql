ALTER TABLE sync_pull_state ADD COLUMN local_received_at_utc TEXT;

CREATE INDEX ix_outbox_failed_review_diagnostic
    ON outbox_messages(state, updated_at_utc DESC)
    WHERE state = 'FAILED_REVIEW';

CREATE INDEX ix_sync_corrections_diagnostic
    ON sync_entity_cache(action, changed_at_utc DESC)
    WHERE action = 'CORRECTION_APPENDED';
