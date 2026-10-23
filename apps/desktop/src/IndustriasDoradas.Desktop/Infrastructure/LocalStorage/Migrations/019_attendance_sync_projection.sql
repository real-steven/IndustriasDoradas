DROP TRIGGER attendance_events_reject_update;

-- Los hechos siguen siendo inmutables. La única transición permitida es
-- confirmar que el servidor recibió exactamente el mismo evento.
CREATE TRIGGER attendance_events_reject_update
BEFORE UPDATE ON attendance_events
WHEN NOT (
    NEW.client_event_id IS OLD.client_event_id AND
    NEW.organization_id IS OLD.organization_id AND
    NEW.plant_id IS OLD.plant_id AND
    NEW.station_id IS OLD.station_id AND
    NEW.worker_id IS OLD.worker_id AND
    NEW.client_sequence IS OLD.client_sequence AND
    NEW.event_type IS OLD.event_type AND
    NEW.occurred_at_utc IS OLD.occurred_at_utc AND
    NEW.recorded_at_utc IS OLD.recorded_at_utc AND
    NEW.corrected_by_profile_id IS OLD.corrected_by_profile_id AND
    NEW.correction_reason IS OLD.correction_reason AND
    NEW.related_event_id IS OLD.related_event_id AND
    OLD.sync_status IN ('PENDING', 'REQUIRES_ATTENTION') AND
    OLD.confirmed_at_utc IS NULL AND
    NEW.sync_status = 'SYNCHRONIZED' AND
    NEW.confirmed_at_utc IS NOT NULL
)
BEGIN
    SELECT RAISE(ABORT, 'ATTENDANCE_HISTORY_IS_APPEND_ONLY');
END;
