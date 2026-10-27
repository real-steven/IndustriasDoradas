-- Sprint 7.9: relacion opcional, inmutable y sin cantidad con una barrida.
CREATE TABLE inventory_sweep_links (
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    inventory_movement_id TEXT NOT NULL,
    sweep_id TEXT NOT NULL,
    linked_by_profile_id TEXT NOT NULL,
    linked_at_utc TEXT NOT NULL,
    PRIMARY KEY (organization_id, inventory_movement_id),
    FOREIGN KEY (organization_id, inventory_movement_id)
        REFERENCES inventory_movements(organization_id, client_movement_id) ON DELETE RESTRICT,
    FOREIGN KEY (sweep_id)
        REFERENCES production_sweeps(id) ON DELETE RESTRICT
);

CREATE INDEX ix_inventory_sweep_links_sweep
    ON inventory_sweep_links(organization_id, sweep_id, plant_id);

CREATE TRIGGER inventory_sweep_links_validate
BEFORE INSERT ON inventory_sweep_links
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM inventory_movements AS movement
        WHERE movement.organization_id = NEW.organization_id
          AND movement.plant_id = NEW.plant_id
          AND movement.client_movement_id = NEW.inventory_movement_id
    ) THEN RAISE(ABORT, 'INVENTORY_SWEEP_MOVEMENT_CONTEXT_MISMATCH') END;
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM production_sweeps AS sweep
        WHERE sweep.organization_id = NEW.organization_id
          AND sweep.plant_id = NEW.plant_id
          AND sweep.id = NEW.sweep_id
    ) THEN RAISE(ABORT, 'INVENTORY_SWEEP_CONTEXT_MISMATCH') END;
    SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM inventory_movements AS reversal
        LEFT JOIN inventory_sweep_links AS original_link
          ON original_link.organization_id = reversal.organization_id
         AND original_link.inventory_movement_id = reversal.related_movement_id
        WHERE reversal.organization_id = NEW.organization_id
          AND reversal.client_movement_id = NEW.inventory_movement_id
          AND reversal.movement_type = 'REVERSAL'
          AND original_link.sweep_id IS NOT NEW.sweep_id
    ) THEN RAISE(ABORT, 'INVENTORY_REVERSAL_SWEEP_MISMATCH') END;
END;

CREATE TRIGGER inventory_sweep_links_reject_update
BEFORE UPDATE ON inventory_sweep_links
BEGIN SELECT RAISE(ABORT, 'inventory_sweep_links are immutable'); END;
CREATE TRIGGER inventory_sweep_links_reject_delete
BEFORE DELETE ON inventory_sweep_links
BEGIN SELECT RAISE(ABORT, 'inventory_sweep_links are immutable'); END;

ALTER TABLE inventory_central_movements ADD COLUMN linked_sweep_id TEXT;
CREATE INDEX ix_inventory_central_movements_sweep
    ON inventory_central_movements(organization_id, linked_sweep_id)
    WHERE linked_sweep_id IS NOT NULL;
