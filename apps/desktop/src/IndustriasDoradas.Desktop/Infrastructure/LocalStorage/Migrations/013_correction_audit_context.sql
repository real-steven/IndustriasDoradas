ALTER TABLE production_event_corrections
    ADD COLUMN actor_kind TEXT NOT NULL DEFAULT 'LEGACY'
        CHECK (actor_kind IN ('LEGACY', 'OPERARIO', 'JEFE_PLANTA'));

ALTER TABLE production_event_corrections
    ADD COLUMN actor_id TEXT;

ALTER TABLE production_event_corrections
    ADD COLUMN actor_display_name TEXT;

ALTER TABLE production_event_corrections
    ADD COLUMN actor_role_code TEXT;

ALTER TABLE production_event_corrections
    ADD COLUMN reason_detail TEXT;

ALTER TABLE production_event_corrections
    ADD COLUMN total_before INTEGER CHECK (total_before IS NULL OR total_before > 0);

ALTER TABLE production_event_corrections
    ADD COLUMN total_after INTEGER CHECK (total_after IS NULL OR total_after >= 0);

ALTER TABLE production_event_corrections
    ADD COLUMN requires_plant_manager INTEGER NOT NULL DEFAULT 0
        CHECK (requires_plant_manager IN (0, 1));

CREATE INDEX ix_production_event_corrections_confirmed
    ON production_event_corrections(confirmed_at_utc DESC);
