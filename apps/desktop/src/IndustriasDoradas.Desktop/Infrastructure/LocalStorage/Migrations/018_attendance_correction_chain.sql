DROP TRIGGER attendance_events_validate_adjustment;

CREATE UNIQUE INDEX ux_attendance_events_single_replacement
    ON attendance_events(organization_id, related_event_id, event_type)
    WHERE event_type IN ('ADJUSTED_CHECK_IN', 'ADJUSTED_CHECK_OUT');

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
        ) THEN RAISE(ABORT, 'ATTENDANCE_ADJUSTMENT_CONTEXT_MISMATCH')
    END;
END;
