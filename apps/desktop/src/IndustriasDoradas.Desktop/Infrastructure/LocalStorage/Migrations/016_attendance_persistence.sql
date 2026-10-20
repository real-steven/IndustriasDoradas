CREATE TABLE attendance_events (
    client_event_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    station_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    client_sequence INTEGER NOT NULL CHECK (client_sequence > 0),
    event_type TEXT NOT NULL CHECK (
        event_type IN ('CHECK_IN', 'CHECK_OUT', 'ADJUSTED_CHECK_IN', 'ADJUSTED_CHECK_OUT')
    ),
    occurred_at_utc TEXT NOT NULL,
    recorded_at_utc TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        sync_status IN ('PENDING', 'SYNCHRONIZED', 'REQUIRES_ATTENTION')
    ),
    confirmed_at_utc TEXT,
    corrected_by_profile_id TEXT,
    correction_reason TEXT,
    related_event_id TEXT,
    UNIQUE (station_id, client_sequence),
    FOREIGN KEY (worker_id) REFERENCES cached_workers(id) ON DELETE RESTRICT,
    FOREIGN KEY (related_event_id) REFERENCES attendance_events(client_event_id) ON DELETE RESTRICT,
    CHECK (
        (sync_status = 'SYNCHRONIZED' AND confirmed_at_utc IS NOT NULL) OR
        sync_status <> 'SYNCHRONIZED'
    ),
    CHECK (
        (
            event_type IN ('CHECK_IN', 'CHECK_OUT') AND
            corrected_by_profile_id IS NULL AND correction_reason IS NULL AND related_event_id IS NULL
        ) OR (
            event_type IN ('ADJUSTED_CHECK_IN', 'ADJUSTED_CHECK_OUT') AND
            corrected_by_profile_id IS NOT NULL AND
            length(trim(correction_reason)) > 0 AND
            related_event_id IS NOT NULL AND related_event_id <> client_event_id
        )
    )
);

CREATE INDEX ix_attendance_events_worker_occurrence
    ON attendance_events(organization_id, worker_id, occurred_at_utc, client_event_id);

CREATE INDEX ix_attendance_events_related
    ON attendance_events(related_event_id)
    WHERE related_event_id IS NOT NULL;

CREATE TRIGGER attendance_events_validate_adjustment
BEFORE INSERT ON attendance_events
WHEN NEW.related_event_id IS NOT NULL
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM attendance_events AS related
            WHERE related.client_event_id = NEW.related_event_id
              AND related.organization_id = NEW.organization_id
              AND related.plant_id = NEW.plant_id
              AND related.worker_id = NEW.worker_id
              AND (
                  (NEW.event_type = 'ADJUSTED_CHECK_IN' AND related.event_type IN ('CHECK_OUT', 'ADJUSTED_CHECK_OUT')) OR
                  (NEW.event_type = 'ADJUSTED_CHECK_OUT' AND related.event_type IN ('CHECK_IN', 'ADJUSTED_CHECK_IN'))
              )
        ) THEN RAISE(ABORT, 'ATTENDANCE_ADJUSTMENT_CONTEXT_OR_DIRECTION_MISMATCH')
    END;
END;

CREATE TRIGGER attendance_events_reject_update
BEFORE UPDATE ON attendance_events
BEGIN
    SELECT RAISE(ABORT, 'ATTENDANCE_HISTORY_IS_APPEND_ONLY');
END;

CREATE TRIGGER attendance_events_reject_delete
BEFORE DELETE ON attendance_events
BEGIN
    SELECT RAISE(ABORT, 'ATTENDANCE_HISTORY_IS_APPEND_ONLY');
END;
