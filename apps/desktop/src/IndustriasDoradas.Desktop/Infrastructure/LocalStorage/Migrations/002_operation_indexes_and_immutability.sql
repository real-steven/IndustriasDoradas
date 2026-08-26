CREATE INDEX ix_cached_suppliers_active
    ON cached_suppliers(organization_id, is_active, name);

CREATE INDEX ix_cached_workers_active
    ON cached_workers(organization_id, is_active, name);

CREATE INDEX ix_cached_lines_active
    ON cached_production_lines(organization_id, plant_id, is_active, name);

CREATE UNIQUE INDEX ux_responsibility_assignments_current
    ON responsibility_assignments(feed_cycle_id)
    WHERE unassigned_at_utc IS NULL;

CREATE UNIQUE INDEX ux_operational_sessions_active_line
    ON operational_sessions(line_id)
    WHERE status = 'ACTIVE';

CREATE INDEX ix_production_events_counter
    ON production_events(line_id, shipment_id, client_sequence);

CREATE INDEX ix_production_events_occurred
    ON production_events(occurred_at_utc);

CREATE INDEX ix_outbox_pending
    ON outbox_messages(state, next_attempt_at_utc, created_at_utc);

CREATE TRIGGER production_events_reject_update
BEFORE UPDATE ON production_events
BEGIN
    SELECT RAISE(ABORT, 'production_events are immutable');
END;

CREATE TRIGGER production_events_reject_delete
BEFORE DELETE ON production_events
BEGIN
    SELECT RAISE(ABORT, 'production_events are immutable');
END;
