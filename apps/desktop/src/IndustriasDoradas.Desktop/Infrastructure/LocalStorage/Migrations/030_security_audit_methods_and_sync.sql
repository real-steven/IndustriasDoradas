-- La versión 29 limitaba event_type a ocho valores. Los eventos biométricos
-- (BIOMETRIC_ELEVATION_ACCEPTED/REJECTED) violaban el CHECK, el INSERT fallaba y
-- la auditoría lo descartaba en silencio. SQLite no permite modificar un CHECK:
-- se reconstruye la tabla conservando cada fila histórica y su identificador.
CREATE TABLE local_security_audit_events_v2 (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL,
    profile_id TEXT,
    actor_display_name TEXT NOT NULL CHECK (length(trim(actor_display_name)) > 0),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'SESSION_FOUND',
        'SESSION_OPENED',
        'SESSION_RESTORED',
        'SESSION_CLOSED',
        'SESSION_EXPIRED',
        'SESSION_REJECTED',
        'ELEVATION_REQUESTED',
        'ELEVATION_ACCEPTED',
        'ELEVATION_REJECTED',
        'ELEVATION_ENDED',
        'BIOMETRIC_REJECTED',
        'BIOMETRIC_FACE_NOT_DETECTED',
        'BIOMETRIC_CAMERA_UNAVAILABLE',
        'BIOMETRIC_FAILED')),
    method TEXT CHECK (method IS NULL OR method IN (
        'PASSWORD',
        'SESSION',
        'PIN',
        'PIN_FALLBACK',
        'BIOMETRIC')),
    result TEXT NOT NULL CHECK (
        length(result) BETWEEN 1 AND 40 AND result = upper(result) AND
        result NOT GLOB '*[^A-Z0-9_]*' AND substr(result, 1, 1) GLOB '[A-Z]'),
    details TEXT NOT NULL CHECK (length(trim(details)) > 0),
    occurred_at_utc TEXT NOT NULL
);

INSERT INTO local_security_audit_events_v2(
    id, station_id, profile_id, actor_display_name, event_type, method,
    result, details, occurred_at_utc)
SELECT id, station_id, profile_id, actor_display_name, event_type,
       CASE
           WHEN event_type IN ('SESSION_OPENED', 'SESSION_REJECTED') THEN 'PASSWORD'
           WHEN event_type IN ('SESSION_RESTORED', 'SESSION_CLOSED', 'SESSION_EXPIRED') THEN 'SESSION'
           WHEN event_type IN ('ELEVATION_ACCEPTED', 'ELEVATION_REJECTED') THEN 'PIN'
           ELSE NULL
       END,
       CASE
           WHEN length(result) BETWEEN 1 AND 40 AND result = upper(result) AND
                result NOT GLOB '*[^A-Z0-9_]*' AND substr(result, 1, 1) GLOB '[A-Z]'
               THEN result
           ELSE 'RECHAZADO'
       END,
       details, occurred_at_utc
FROM local_security_audit_events;

DROP TABLE local_security_audit_events;
ALTER TABLE local_security_audit_events_v2 RENAME TO local_security_audit_events;

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
