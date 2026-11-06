CREATE TABLE local_security_audit_events (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    profile_id TEXT,
    actor_display_name TEXT NOT NULL CHECK (length(trim(actor_display_name)) > 0),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'SESSION_OPENED',
        'SESSION_RESTORED',
        'SESSION_CLOSED',
        'SESSION_EXPIRED',
        'SESSION_REJECTED',
        'ELEVATION_ACCEPTED',
        'ELEVATION_REJECTED',
        'ELEVATION_ENDED')),
    result TEXT NOT NULL CHECK (length(trim(result)) > 0),
    details TEXT NOT NULL CHECK (length(trim(details)) > 0),
    occurred_at_utc TEXT NOT NULL
);

CREATE INDEX ix_local_security_audit_occurred
    ON local_security_audit_events(occurred_at_utc DESC, id DESC);

CREATE INDEX ix_local_security_audit_type
    ON local_security_audit_events(event_type, occurred_at_utc DESC);

CREATE TRIGGER local_security_audit_reject_update
BEFORE UPDATE ON local_security_audit_events
BEGIN
    SELECT RAISE(ABORT, 'local_security_audit_events are immutable');
END;

CREATE TRIGGER local_security_audit_reject_delete
BEFORE DELETE ON local_security_audit_events
BEGIN
    SELECT RAISE(ABORT, 'local_security_audit_events are immutable');
END;
