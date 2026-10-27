-- Sprint 7.7: espejo confirmado por el servidor.
-- Se separa del hecho local para que un movimiento rechazado siga visible sin
-- impedir aplicar movimientos válidos originados en otra estación.
CREATE TABLE inventory_central_movements (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    movement_type TEXT NOT NULL,
    quantity_delta_milliunits INTEGER NOT NULL,
    actor_profile_id TEXT NOT NULL,
    station_id TEXT,
    client_sequence INTEGER,
    responsible_worker_id TEXT,
    occurred_at_utc TEXT NOT NULL,
    recorded_at_utc TEXT NOT NULL,
    reason TEXT,
    destination TEXT,
    notes TEXT,
    related_movement_id TEXT,
    FOREIGN KEY (organization_id, plant_id, inventory_item_id)
        REFERENCES inventory_items(organization_id, plant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, unit_id)
        REFERENCES inventory_units(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX ix_inventory_central_movements_item
    ON inventory_central_movements(organization_id, plant_id, inventory_item_id);

DROP TRIGGER inventory_movements_validate;
CREATE TRIGGER inventory_movements_validate
BEFORE INSERT ON inventory_movements
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM inventory_items AS item
        JOIN inventory_units AS unit
          ON unit.organization_id = item.organization_id AND unit.id = item.unit_id
        WHERE item.organization_id = NEW.organization_id
          AND item.plant_id = NEW.plant_id
          AND item.id = NEW.inventory_item_id
          AND item.unit_id = NEW.unit_id
          AND item.is_active = 1 AND unit.is_active = 1
          AND CASE unit.decimal_places
              WHEN 0 THEN NEW.quantity_delta_milliunits % 1000 = 0
              WHEN 1 THEN NEW.quantity_delta_milliunits % 100 = 0
              WHEN 2 THEN NEW.quantity_delta_milliunits % 10 = 0
              ELSE 1
          END
    ) THEN RAISE(ABORT, 'INVENTORY_ITEM_UNIT_OR_PRECISION_MISMATCH') END;

    SELECT CASE WHEN NEW.responsible_worker_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM cached_workers AS worker
        WHERE worker.organization_id = NEW.organization_id
          AND worker.id = NEW.responsible_worker_id
    ) THEN RAISE(ABORT, 'INVENTORY_WORKER_ORGANIZATION_MISMATCH') END;

    SELECT CASE WHEN
      COALESCE((SELECT SUM(central.quantity_delta_milliunits)
        FROM inventory_central_movements AS central
        WHERE central.organization_id = NEW.organization_id
          AND central.plant_id = NEW.plant_id
          AND central.inventory_item_id = NEW.inventory_item_id), 0)
      + COALESCE((SELECT SUM(local.quantity_delta_milliunits)
        FROM inventory_movements AS local
        LEFT JOIN outbox_messages AS pending
          ON pending.aggregate_type = 'inventory_movement'
         AND pending.aggregate_id = local.client_movement_id
        WHERE local.organization_id = NEW.organization_id
          AND local.plant_id = NEW.plant_id
          AND local.inventory_item_id = NEW.inventory_item_id
          AND (pending.id IS NULL OR pending.state <> 'SYNCED')), 0)
      + NEW.quantity_delta_milliunits < 0
    THEN RAISE(ABORT, 'INVENTORY_STOCK_INSUFFICIENT') END;

    SELECT CASE WHEN NEW.related_movement_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM inventory_movements AS related
        WHERE related.organization_id = NEW.organization_id
          AND related.plant_id = NEW.plant_id
          AND related.inventory_item_id = NEW.inventory_item_id
          AND related.unit_id = NEW.unit_id
          AND related.client_movement_id = NEW.related_movement_id
    ) THEN RAISE(ABORT, 'INVENTORY_RELATED_CONTEXT_MISMATCH') END;

    SELECT CASE WHEN NEW.movement_type = 'RETURN'
      AND NEW.related_movement_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM inventory_movements AS related
        WHERE related.client_movement_id = NEW.related_movement_id
          AND related.movement_type = 'EXIT'
      ) THEN RAISE(ABORT, 'INVENTORY_RETURN_REQUIRES_EXIT') END;

    SELECT CASE WHEN NEW.movement_type = 'RETURN'
      AND NEW.related_movement_id IS NOT NULL
      AND (
        SELECT COALESCE(SUM(returned.quantity_delta_milliunits), 0)
        FROM inventory_movements AS returned
        WHERE returned.movement_type = 'RETURN'
          AND returned.related_movement_id = NEW.related_movement_id
      ) + NEW.quantity_delta_milliunits > (
        SELECT abs(related.quantity_delta_milliunits)
        FROM inventory_movements AS related
        WHERE related.client_movement_id = NEW.related_movement_id
      ) THEN RAISE(ABORT, 'INVENTORY_RETURN_EXCEEDS_EXIT') END;

    SELECT CASE WHEN NEW.movement_type = 'REVERSAL' AND NOT EXISTS (
        SELECT 1 FROM inventory_movements AS related
        WHERE related.client_movement_id = NEW.related_movement_id
          AND related.movement_type <> 'REVERSAL'
          AND NEW.quantity_delta_milliunits = -related.quantity_delta_milliunits
          AND NOT (
            related.movement_type = 'EXIT' AND EXISTS (
              SELECT 1 FROM inventory_movements AS returned
              WHERE returned.movement_type = 'RETURN'
                AND returned.related_movement_id = related.client_movement_id
            )
          )
    ) THEN RAISE(ABORT, 'INVENTORY_REVERSAL_INVALID') END;
END;
