-- Sprint 7.4: inventario local exacto en milésimas de unidad.
-- No existe columna de stock: el saldo se deriva de inventory_movements.

CREATE TABLE inventory_item_types (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at_utc TEXT NOT NULL,
    UNIQUE (organization_id, id),
    UNIQUE (organization_id, code),
    CHECK (code = upper(trim(code)) AND length(code) > 0),
    CHECK (length(trim(name)) > 0)
);

CREATE TABLE inventory_units (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    decimal_places INTEGER NOT NULL CHECK (decimal_places BETWEEN 0 AND 3),
    is_custom INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at_utc TEXT NOT NULL,
    UNIQUE (organization_id, id),
    UNIQUE (organization_id, code),
    CHECK (code = upper(trim(code)) AND length(code) > 0),
    CHECK (length(trim(name)) > 0)
);

CREATE TABLE inventory_items (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    item_type_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at_utc TEXT NOT NULL,
    UNIQUE (organization_id, plant_id, id),
    UNIQUE (organization_id, plant_id, name),
    FOREIGN KEY (organization_id, item_type_id)
        REFERENCES inventory_item_types(organization_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, unit_id)
        REFERENCES inventory_units(organization_id, id) ON DELETE RESTRICT,
    CHECK (length(trim(name)) > 0)
);

CREATE INDEX ix_inventory_items_type_active
    ON inventory_items(organization_id, item_type_id, plant_id, is_active, name);
CREATE INDEX ix_inventory_items_unit
    ON inventory_items(organization_id, unit_id);

CREATE TABLE inventory_movements (
    client_movement_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    movement_type TEXT NOT NULL CHECK (
        movement_type IN ('ENTRY', 'EXIT', 'CONSUMPTION', 'RETURN', 'ADJUSTMENT', 'REVERSAL')
    ),
    quantity_delta_milliunits INTEGER NOT NULL CHECK (quantity_delta_milliunits <> 0),
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
    UNIQUE (organization_id, client_movement_id),
    FOREIGN KEY (organization_id, plant_id, inventory_item_id)
        REFERENCES inventory_items(organization_id, plant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, unit_id)
        REFERENCES inventory_units(organization_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (related_movement_id)
        REFERENCES inventory_movements(client_movement_id) ON DELETE RESTRICT,
    CHECK (
        (station_id IS NULL AND client_sequence IS NULL) OR
        (station_id IS NOT NULL AND client_sequence > 0)
    ),
    CHECK (recorded_at_utc >= occurred_at_utc),
    CHECK (
        (movement_type IN ('ENTRY', 'RETURN') AND quantity_delta_milliunits > 0) OR
        (movement_type IN ('EXIT', 'CONSUMPTION') AND quantity_delta_milliunits < 0) OR
        movement_type IN ('ADJUSTMENT', 'REVERSAL')
    ),
    CHECK (
        movement_type NOT IN ('ADJUSTMENT', 'REVERSAL') OR
        length(trim(reason)) > 0
    ),
    CHECK (
        (movement_type = 'REVERSAL' AND related_movement_id IS NOT NULL) OR
        movement_type = 'RETURN' OR
        (movement_type NOT IN ('RETURN', 'REVERSAL') AND related_movement_id IS NULL)
    ),
    CHECK (related_movement_id IS NULL OR related_movement_id <> client_movement_id),
    CHECK (reason IS NULL OR length(trim(reason)) > 0),
    CHECK (destination IS NULL OR length(trim(destination)) > 0),
    CHECK (notes IS NULL OR length(trim(notes)) > 0)
);

CREATE UNIQUE INDEX ux_inventory_movements_station_sequence
    ON inventory_movements(organization_id, station_id, client_sequence)
    WHERE station_id IS NOT NULL;
CREATE UNIQUE INDEX ux_inventory_movements_reversal_once
    ON inventory_movements(organization_id, related_movement_id)
    WHERE movement_type = 'REVERSAL';
CREATE INDEX ix_inventory_movements_item_time
    ON inventory_movements(
        organization_id, plant_id, inventory_item_id, occurred_at_utc, client_movement_id
    );
CREATE INDEX ix_inventory_movements_related
    ON inventory_movements(organization_id, related_movement_id)
    WHERE related_movement_id IS NOT NULL;

CREATE TABLE inventory_reviews (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('WITHOUT_DIFFERENCES', 'WITH_DIFFERENCES')),
    reviewed_by_profile_id TEXT NOT NULL,
    station_id TEXT,
    client_sequence INTEGER,
    reviewed_at_utc TEXT NOT NULL,
    recorded_at_utc TEXT NOT NULL,
    notes TEXT,
    UNIQUE (organization_id, plant_id, id),
    CHECK (
        (station_id IS NULL AND client_sequence IS NULL) OR
        (station_id IS NOT NULL AND client_sequence > 0)
    ),
    CHECK (recorded_at_utc >= reviewed_at_utc),
    CHECK (notes IS NULL OR length(trim(notes)) > 0)
);

CREATE UNIQUE INDEX ux_inventory_reviews_station_sequence
    ON inventory_reviews(organization_id, station_id, client_sequence)
    WHERE station_id IS NOT NULL;
CREATE INDEX ix_inventory_reviews_plant_time
    ON inventory_reviews(organization_id, plant_id, reviewed_at_utc, id);

CREATE TABLE inventory_review_lines (
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    review_id TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    expected_milliunits INTEGER NOT NULL CHECK (expected_milliunits >= 0),
    counted_milliunits INTEGER NOT NULL CHECK (counted_milliunits >= 0),
    difference_milliunits INTEGER NOT NULL,
    PRIMARY KEY (organization_id, review_id, inventory_item_id),
    FOREIGN KEY (organization_id, plant_id, review_id)
        REFERENCES inventory_reviews(organization_id, plant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, plant_id, inventory_item_id)
        REFERENCES inventory_items(organization_id, plant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, unit_id)
        REFERENCES inventory_units(organization_id, id) ON DELETE RESTRICT,
    CHECK (difference_milliunits = counted_milliunits - expected_milliunits)
);

CREATE INDEX ix_inventory_review_lines_item
    ON inventory_review_lines(organization_id, plant_id, inventory_item_id, review_id);

CREATE TABLE rastra_component_changes (
    client_change_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    rastra_id TEXT NOT NULL,
    change_type TEXT NOT NULL CHECK (change_type IN ('INSTALLATION', 'REMOVAL', 'REPLACEMENT')),
    installation_id TEXT NOT NULL,
    replaced_installation_id TEXT,
    inventory_item_id TEXT,
    unit_id TEXT,
    quantity_milliunits INTEGER,
    actor_profile_id TEXT NOT NULL,
    station_id TEXT,
    client_sequence INTEGER,
    responsible_worker_id TEXT,
    occurred_at_utc TEXT NOT NULL,
    recorded_at_utc TEXT NOT NULL,
    component_identifier TEXT,
    installed_condition TEXT,
    removed_condition TEXT,
    reason TEXT,
    installation_notes TEXT,
    removal_notes TEXT,
    FOREIGN KEY (rastra_id) REFERENCES cached_line_components(id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, plant_id, inventory_item_id)
        REFERENCES inventory_items(organization_id, plant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, unit_id)
        REFERENCES inventory_units(organization_id, id) ON DELETE RESTRICT,
    CHECK (
        (station_id IS NULL AND client_sequence IS NULL) OR
        (station_id IS NOT NULL AND client_sequence > 0)
    ),
    CHECK (recorded_at_utc >= occurred_at_utc),
    CHECK (
        (change_type = 'INSTALLATION' AND replaced_installation_id IS NULL AND
         inventory_item_id IS NOT NULL AND unit_id IS NOT NULL AND quantity_milliunits > 0 AND
         length(trim(installed_condition)) > 0 AND removed_condition IS NULL AND reason IS NULL) OR
        (change_type = 'REMOVAL' AND replaced_installation_id IS NULL AND
         inventory_item_id IS NULL AND unit_id IS NULL AND quantity_milliunits IS NULL AND
         installed_condition IS NULL AND length(trim(removed_condition)) > 0 AND
         length(trim(reason)) > 0) OR
        (change_type = 'REPLACEMENT' AND replaced_installation_id IS NOT NULL AND
         replaced_installation_id <> installation_id AND inventory_item_id IS NOT NULL AND
         unit_id IS NOT NULL AND quantity_milliunits > 0 AND
         length(trim(installed_condition)) > 0 AND length(trim(removed_condition)) > 0 AND
         length(trim(reason)) > 0)
    )
);

CREATE UNIQUE INDEX ux_rastra_component_station_sequence
    ON rastra_component_changes(organization_id, station_id, client_sequence)
    WHERE station_id IS NOT NULL;
CREATE UNIQUE INDEX ux_rastra_component_installation_once
    ON rastra_component_changes(organization_id, installation_id)
    WHERE change_type IN ('INSTALLATION', 'REPLACEMENT');
CREATE UNIQUE INDEX ux_rastra_component_closure_once
    ON rastra_component_changes(
        organization_id,
        CASE WHEN change_type = 'REMOVAL' THEN installation_id ELSE replaced_installation_id END
    ) WHERE change_type IN ('REMOVAL', 'REPLACEMENT');
CREATE INDEX ix_rastra_component_timeline
    ON rastra_component_changes(organization_id, plant_id, rastra_id, occurred_at_utc);

CREATE TABLE operational_novelty_categories (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at_utc TEXT NOT NULL,
    UNIQUE (organization_id, id),
    UNIQUE (organization_id, code),
    CHECK (code = upper(trim(code)) AND length(code) > 0),
    CHECK (length(trim(name)) > 0)
);

CREATE TABLE operational_novelty_changes (
    client_change_id TEXT PRIMARY KEY,
    novelty_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    plant_id TEXT NOT NULL,
    change_type TEXT NOT NULL CHECK (change_type IN ('OPENING', 'CLOSURE')),
    line_id TEXT,
    category_id TEXT,
    description TEXT,
    actor_profile_id TEXT NOT NULL,
    station_id TEXT,
    client_sequence INTEGER,
    responsible_worker_id TEXT,
    occurred_at_utc TEXT NOT NULL,
    recorded_at_utc TEXT NOT NULL,
    FOREIGN KEY (line_id) REFERENCES cached_production_lines(id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, category_id)
        REFERENCES operational_novelty_categories(organization_id, id) ON DELETE RESTRICT,
    CHECK (
        (station_id IS NULL AND client_sequence IS NULL) OR
        (station_id IS NOT NULL AND client_sequence > 0)
    ),
    CHECK (recorded_at_utc >= occurred_at_utc),
    CHECK (
        (change_type = 'OPENING' AND length(trim(description)) > 0) OR
        (change_type = 'CLOSURE' AND line_id IS NULL AND category_id IS NULL AND description IS NULL)
    )
);

CREATE UNIQUE INDEX ux_operational_novelty_opening_once
    ON operational_novelty_changes(organization_id, novelty_id)
    WHERE change_type = 'OPENING';
CREATE UNIQUE INDEX ux_operational_novelty_closure_once
    ON operational_novelty_changes(organization_id, novelty_id)
    WHERE change_type = 'CLOSURE';
CREATE UNIQUE INDEX ux_operational_novelty_station_sequence
    ON operational_novelty_changes(organization_id, station_id, client_sequence)
    WHERE station_id IS NOT NULL;
CREATE INDEX ix_operational_novelty_plant_time
    ON operational_novelty_changes(organization_id, plant_id, occurred_at_utc, novelty_id);

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

    SELECT CASE WHEN (
        SELECT COALESCE(SUM(quantity_delta_milliunits), 0)
        FROM inventory_movements
        WHERE organization_id = NEW.organization_id
          AND plant_id = NEW.plant_id
          AND inventory_item_id = NEW.inventory_item_id
    ) + NEW.quantity_delta_milliunits < 0
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

CREATE TRIGGER inventory_review_lines_validate
BEFORE INSERT ON inventory_review_lines
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
          AND CASE unit.decimal_places
              WHEN 0 THEN NEW.expected_milliunits % 1000 = 0
                          AND NEW.counted_milliunits % 1000 = 0
              WHEN 1 THEN NEW.expected_milliunits % 100 = 0
                          AND NEW.counted_milliunits % 100 = 0
              WHEN 2 THEN NEW.expected_milliunits % 10 = 0
                          AND NEW.counted_milliunits % 10 = 0
              ELSE 1
          END
    ) THEN RAISE(ABORT, 'INVENTORY_REVIEW_UNIT_OR_PRECISION_MISMATCH') END;

    SELECT CASE WHEN NEW.difference_milliunits <> 0 AND EXISTS (
        SELECT 1 FROM inventory_reviews AS review
        WHERE review.organization_id = NEW.organization_id
          AND review.id = NEW.review_id
          AND review.status = 'WITHOUT_DIFFERENCES'
    ) THEN RAISE(ABORT, 'INVENTORY_REVIEW_STATUS_MISMATCH') END;
END;

CREATE TRIGGER rastra_component_changes_validate
BEFORE INSERT ON rastra_component_changes
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1
        FROM cached_line_components AS component
        JOIN cached_production_lines AS line ON line.id = component.line_id
        WHERE component.id = NEW.rastra_id
          AND component.organization_id = NEW.organization_id
          AND component.component_type_code = 'RASTRA'
          AND line.organization_id = NEW.organization_id
          AND line.plant_id = NEW.plant_id
    ) THEN RAISE(ABORT, 'INVENTORY_COMPONENT_REQUIRES_RASTRA') END;

    SELECT CASE WHEN NEW.change_type IN ('INSTALLATION', 'REPLACEMENT') AND NOT EXISTS (
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
              WHEN 0 THEN NEW.quantity_milliunits % 1000 = 0
              WHEN 1 THEN NEW.quantity_milliunits % 100 = 0
              WHEN 2 THEN NEW.quantity_milliunits % 10 = 0
              ELSE 1
          END
    ) THEN RAISE(ABORT, 'INVENTORY_COMPONENT_ITEM_OR_PRECISION_MISMATCH') END;

    SELECT CASE WHEN NEW.change_type IN ('REMOVAL', 'REPLACEMENT') AND NOT EXISTS (
        SELECT 1 FROM rastra_component_changes AS previous
        WHERE previous.organization_id = NEW.organization_id
          AND previous.plant_id = NEW.plant_id
          AND previous.rastra_id = NEW.rastra_id
          AND previous.change_type IN ('INSTALLATION', 'REPLACEMENT')
          AND previous.installation_id = CASE
              WHEN NEW.change_type = 'REMOVAL' THEN NEW.installation_id
              ELSE NEW.replaced_installation_id
          END
          AND previous.occurred_at_utc <= NEW.occurred_at_utc
    ) THEN RAISE(ABORT, 'INVENTORY_COMPONENT_INSTALLATION_NOT_FOUND_OR_LATE') END;
END;

CREATE TRIGGER operational_novelty_changes_validate
BEFORE INSERT ON operational_novelty_changes
BEGIN
    SELECT CASE WHEN NEW.change_type = 'OPENING' AND NEW.line_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM cached_production_lines AS line
        WHERE line.id = NEW.line_id
          AND line.organization_id = NEW.organization_id
          AND line.plant_id = NEW.plant_id
    ) THEN RAISE(ABORT, 'OPERATIONAL_NOVELTY_LINE_MISMATCH') END;

    SELECT CASE WHEN NEW.change_type = 'OPENING' AND NEW.category_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM operational_novelty_categories AS category
        WHERE category.id = NEW.category_id
          AND category.organization_id = NEW.organization_id
          AND category.is_active = 1
    ) THEN RAISE(ABORT, 'OPERATIONAL_NOVELTY_CATEGORY_INACTIVE') END;

    SELECT CASE WHEN NEW.responsible_worker_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM cached_workers AS worker
        WHERE worker.id = NEW.responsible_worker_id
          AND worker.organization_id = NEW.organization_id
    ) THEN RAISE(ABORT, 'OPERATIONAL_NOVELTY_WORKER_MISMATCH') END;

    SELECT CASE WHEN NEW.change_type = 'CLOSURE' AND NOT EXISTS (
        SELECT 1 FROM operational_novelty_changes AS opening
        WHERE opening.organization_id = NEW.organization_id
          AND opening.plant_id = NEW.plant_id
          AND opening.novelty_id = NEW.novelty_id
          AND opening.change_type = 'OPENING'
          AND opening.occurred_at_utc <= NEW.occurred_at_utc
    ) THEN RAISE(ABORT, 'OPERATIONAL_NOVELTY_OPENING_NOT_FOUND_OR_LATE') END;
END;

CREATE TRIGGER inventory_movements_reject_update BEFORE UPDATE ON inventory_movements
BEGIN SELECT RAISE(ABORT, 'INVENTORY_HISTORY_IS_APPEND_ONLY'); END;
CREATE TRIGGER inventory_movements_reject_delete BEFORE DELETE ON inventory_movements
BEGIN SELECT RAISE(ABORT, 'INVENTORY_HISTORY_IS_APPEND_ONLY'); END;

CREATE TRIGGER inventory_reviews_reject_update BEFORE UPDATE ON inventory_reviews
BEGIN SELECT RAISE(ABORT, 'INVENTORY_HISTORY_IS_APPEND_ONLY'); END;
CREATE TRIGGER inventory_reviews_reject_delete BEFORE DELETE ON inventory_reviews
BEGIN SELECT RAISE(ABORT, 'INVENTORY_HISTORY_IS_APPEND_ONLY'); END;

CREATE TRIGGER inventory_review_lines_reject_update BEFORE UPDATE ON inventory_review_lines
BEGIN SELECT RAISE(ABORT, 'INVENTORY_HISTORY_IS_APPEND_ONLY'); END;
CREATE TRIGGER inventory_review_lines_reject_delete BEFORE DELETE ON inventory_review_lines
BEGIN SELECT RAISE(ABORT, 'INVENTORY_HISTORY_IS_APPEND_ONLY'); END;

CREATE TRIGGER rastra_component_changes_reject_update BEFORE UPDATE ON rastra_component_changes
BEGIN SELECT RAISE(ABORT, 'INVENTORY_HISTORY_IS_APPEND_ONLY'); END;
CREATE TRIGGER rastra_component_changes_reject_delete BEFORE DELETE ON rastra_component_changes
BEGIN SELECT RAISE(ABORT, 'INVENTORY_HISTORY_IS_APPEND_ONLY'); END;

CREATE TRIGGER operational_novelty_changes_reject_update BEFORE UPDATE ON operational_novelty_changes
BEGIN SELECT RAISE(ABORT, 'INVENTORY_HISTORY_IS_APPEND_ONLY'); END;
CREATE TRIGGER operational_novelty_changes_reject_delete BEFORE DELETE ON operational_novelty_changes
BEGIN SELECT RAISE(ABORT, 'INVENTORY_HISTORY_IS_APPEND_ONLY'); END;
