-- Sprint 7.4: kardex exacto, conteos, componentes y novedades append-only.

insert into app.inventory_item_types (
  id, organization_id, code, name, is_custom
) values (
  '77000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'HERRAMIENTA', 'Herramienta', false
);

insert into app.inventory_units (
  id, organization_id, code, name, decimal_places, is_custom
) values (
  '77100000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'UNIDAD', 'Unidad', 0, false
);

insert into app.inventory_items (
  id, organization_id, plant_id, item_type_id, unit_id, name
) values (
  '77200000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001',
  '77100000-0000-4000-8000-000000000001',
  'Cadena de rastra'
);

insert into app.operational_novelty_categories (
  id, organization_id, code, name
) values (
  '77300000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'FALLA_EQUIPO', 'Falla de equipo'
);

insert into app.inventory_movements (
  id, organization_id, plant_id, inventory_item_id, unit_id, movement_type,
  quantity_delta, actor_profile_id, station_id, client_sequence,
  responsible_worker_id, occurred_at_utc, recorded_at_utc, notes
) values (
  '77400000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '77200000-0000-4000-8000-000000000001',
  '77100000-0000-4000-8000-000000000001',
  'ENTRY', 10,
  'a1000000-0000-4000-8000-000000000002',
  '34000000-0000-4000-8000-000000000001', 7101, null,
  '2026-10-21T18:00:00Z', '2026-10-21T18:00:00Z', 'Entrada inicial'
);

insert into app.inventory_movements (
  id, organization_id, plant_id, inventory_item_id, unit_id, movement_type,
  quantity_delta, actor_profile_id, station_id, client_sequence,
  responsible_worker_id, occurred_at_utc, recorded_at_utc, destination
) values (
  '77400000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '77200000-0000-4000-8000-000000000001',
  '77100000-0000-4000-8000-000000000001',
  'EXIT', -4,
  'a1000000-0000-4000-8000-000000000002',
  '34000000-0000-4000-8000-000000000001', 7102,
  'b1000000-0000-4000-8000-000000000001',
  '2026-10-21T18:01:00Z', '2026-10-21T18:01:00Z', 'Planta'
);

insert into app.inventory_movements (
  id, organization_id, plant_id, inventory_item_id, unit_id, movement_type,
  quantity_delta, actor_profile_id, station_id, client_sequence,
  responsible_worker_id, occurred_at_utc, recorded_at_utc, related_movement_id
) values (
  '77400000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '77200000-0000-4000-8000-000000000001',
  '77100000-0000-4000-8000-000000000001',
  'RETURN', 2,
  'a1000000-0000-4000-8000-000000000002',
  '34000000-0000-4000-8000-000000000001', 7103,
  'b1000000-0000-4000-8000-000000000001',
  '2026-10-21T18:02:00Z', '2026-10-21T18:02:00Z',
  '77400000-0000-4000-8000-000000000002'
);

insert into app.inventory_movements (
  id, organization_id, plant_id, inventory_item_id, unit_id, movement_type,
  quantity_delta, actor_profile_id, station_id, client_sequence,
  occurred_at_utc, recorded_at_utc, reason
) values (
  '77400000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '77200000-0000-4000-8000-000000000001',
  '77100000-0000-4000-8000-000000000001',
  'ADJUSTMENT', -1,
  'a1000000-0000-4000-8000-000000000002',
  '34000000-0000-4000-8000-000000000001', 7104,
  '2026-10-21T18:03:00Z', '2026-10-21T18:03:00Z',
  'Diferencia en conteo físico'
);

insert into app.inventory_movements (
  id, organization_id, plant_id, inventory_item_id, unit_id, movement_type,
  quantity_delta, actor_profile_id, station_id, client_sequence,
  occurred_at_utc, recorded_at_utc, reason, related_movement_id
) values (
  '77400000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '77200000-0000-4000-8000-000000000001',
  '77100000-0000-4000-8000-000000000001',
  'REVERSAL', 1,
  'a1000000-0000-4000-8000-000000000002',
  '34000000-0000-4000-8000-000000000001', 7105,
  '2026-10-21T18:04:00Z', '2026-10-21T18:04:00Z',
  'Corrección del ajuste', '77400000-0000-4000-8000-000000000004'
);

insert into app.inventory_reviews (
  id, organization_id, plant_id, status, reviewed_by_profile_id,
  station_id, client_sequence, reviewed_at_utc, recorded_at_utc, notes
) values (
  '77500000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'WITH_DIFFERENCES', 'a1000000-0000-4000-8000-000000000002',
  '34000000-0000-4000-8000-000000000001', 7106,
  '2026-10-21T18:05:00Z', '2026-10-21T18:05:00Z', 'Conteo de cierre'
);

insert into app.inventory_review_lines (
  organization_id, plant_id, review_id, inventory_item_id, unit_id,
  expected_quantity, counted_quantity, difference_quantity
) values (
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '77500000-0000-4000-8000-000000000001',
  '77200000-0000-4000-8000-000000000001',
  '77100000-0000-4000-8000-000000000001',
  8, 7, -1
);

insert into app.rastra_component_changes (
  id, organization_id, plant_id, rastra_id, change_type, installation_id,
  inventory_item_id, unit_id, quantity, actor_profile_id, responsible_worker_id,
  occurred_at_utc, recorded_at_utc, component_identifier, installed_condition
) values (
  '77800000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8001-000000000002', 'INSTALLATION',
  '77600000-0000-4000-8000-000000000001',
  '77200000-0000-4000-8000-000000000001',
  '77100000-0000-4000-8000-000000000001', 1,
  'a1000000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000001',
  '2026-10-21T18:10:00Z', '2026-10-21T18:10:00Z', 'CADENA-A', 'Nueva'
);

insert into app.rastra_component_changes (
  id, organization_id, plant_id, rastra_id, change_type, installation_id,
  replaced_installation_id, inventory_item_id, unit_id, quantity,
  actor_profile_id, responsible_worker_id, occurred_at_utc, recorded_at_utc,
  component_identifier, installed_condition, removed_condition, reason
) values
  (
    '77800000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '33000000-0000-4000-8001-000000000002', 'REPLACEMENT',
    '77600000-0000-4000-8000-000000000002',
    '77600000-0000-4000-8000-000000000001',
    '77200000-0000-4000-8000-000000000001',
    '77100000-0000-4000-8000-000000000001', 1,
    'a1000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000001',
    '2026-10-21T18:20:00Z', '2026-10-21T18:20:00Z',
    'CADENA-B', 'Nueva', 'Desgastada', 'Desgaste normal'
  ),
  (
    '77800000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '33000000-0000-4000-8001-000000000002', 'REPLACEMENT',
    '77600000-0000-4000-8000-000000000003',
    '77600000-0000-4000-8000-000000000002',
    '77200000-0000-4000-8000-000000000001',
    '77100000-0000-4000-8000-000000000001', 1,
    'a1000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000001',
    '2026-10-21T18:30:00Z', '2026-10-21T18:30:00Z',
    'CADENA-C', 'Nueva', 'Dañada', 'Rotura'
  );

insert into app.operational_novelty_changes (
  id, novelty_id, organization_id, plant_id, change_type, line_id, category_id,
  description, actor_profile_id, responsible_worker_id,
  occurred_at_utc, recorded_at_utc
) values (
  '77900000-0000-4000-8000-000000000001',
  '77700000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001', 'OPENING',
  '32000000-0000-4000-8000-000000000001',
  '77300000-0000-4000-8000-000000000001',
  'Rastra detenida por cadena dañada',
  'a1000000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000001',
  '2026-10-21T23:30:00Z', '2026-10-21T23:30:00Z'
);

insert into app.operational_novelty_changes (
  id, novelty_id, organization_id, plant_id, change_type,
  actor_profile_id, responsible_worker_id, occurred_at_utc, recorded_at_utc
) values (
  '77900000-0000-4000-8000-000000000002',
  '77700000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001', 'CLOSURE',
  'a1000000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000001',
  '2026-10-22T01:15:00Z', '2026-10-22T01:15:00Z'
);

do $$
begin
  if (select sum(quantity_delta) from app.inventory_movements
      where inventory_item_id = '77200000-0000-4000-8000-000000000001') <> 8 then
    raise exception 'inventory balance must be derived as 8 units';
  end if;
  if (select count(*) from app.inventory_movements
      where inventory_item_id = '77200000-0000-4000-8000-000000000001') <> 5 then
    raise exception 'inventory ledger must preserve all five facts';
  end if;
  if (select difference_quantity from app.inventory_review_lines
      where review_id = '77500000-0000-4000-8000-000000000001') <> -1 then
    raise exception 'physical count difference was not retained';
  end if;
  if (select count(*) from app.rastra_component_changes as installed
      where installed.organization_id = '30000000-0000-4000-8000-000000000001'
        and installed.rastra_id = '33000000-0000-4000-8001-000000000002'
        and installed.change_type in ('INSTALLATION', 'REPLACEMENT')
        and not exists (
          select 1 from app.rastra_component_changes as closed
          where closed.organization_id = installed.organization_id
            and closed.change_type in ('REMOVAL', 'REPLACEMENT')
            and (case when closed.change_type = 'REMOVAL'
              then closed.installation_id else closed.replaced_installation_id end)
              = installed.installation_id
        )) <> 1 then
    raise exception 'only the third component installation must remain active';
  end if;
  if (select max(occurred_at_utc) - min(occurred_at_utc)
      from app.operational_novelty_changes
      where novelty_id = '77700000-0000-4000-8000-000000000001')
      <> interval '1 hour 45 minutes' then
    raise exception 'novelty must retain the real 17:30 to 19:15 interval';
  end if;

  begin
    insert into app.inventory_movements (
      id, organization_id, plant_id, inventory_item_id, unit_id, movement_type,
      quantity_delta, actor_profile_id, occurred_at_utc, recorded_at_utc
    ) values (
      '77400000-0000-4000-8000-000000000006',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '77200000-0000-4000-8000-000000000001',
      '77100000-0000-4000-8000-000000000001', 'CONSUMPTION', -9,
      'a1000000-0000-4000-8000-000000000002',
      '2026-10-21T18:40:00Z', '2026-10-21T18:40:00Z'
    );
    raise exception 'negative inventory must fail';
  exception when check_violation then
    if sqlerrm <> 'INVENTORY_STOCK_INSUFFICIENT' then raise; end if;
  end;

  begin
    insert into app.inventory_movements (
      id, organization_id, plant_id, inventory_item_id, unit_id, movement_type,
      quantity_delta, actor_profile_id, occurred_at_utc, recorded_at_utc
    ) values (
      '77400000-0000-4000-8000-000000000007',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '77200000-0000-4000-8000-000000000001',
      '77100000-0000-4000-8000-000000000001', 'ENTRY', 0.5,
      'a1000000-0000-4000-8000-000000000002',
      '2026-10-21T18:41:00Z', '2026-10-21T18:41:00Z'
    );
    raise exception 'unit precision violation must fail';
  exception when check_violation then
    if sqlerrm <> 'INVENTORY_UNIT_PRECISION_MISMATCH' then raise; end if;
  end;

  begin
    insert into app.inventory_movements (
      id, organization_id, plant_id, inventory_item_id, unit_id, movement_type,
      quantity_delta, actor_profile_id, occurred_at_utc, recorded_at_utc,
      related_movement_id
    ) values (
      '77400000-0000-4000-8000-000000000008',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '77200000-0000-4000-8000-000000000001',
      '77100000-0000-4000-8000-000000000001', 'RETURN', 3,
      'a1000000-0000-4000-8000-000000000002',
      '2026-10-21T18:42:00Z', '2026-10-21T18:42:00Z',
      '77400000-0000-4000-8000-000000000002'
    );
    raise exception 'return beyond the exit must fail';
  exception when check_violation then
    if sqlerrm <> 'INVENTORY_RETURN_EXCEEDS_EXIT' then raise; end if;
  end;

  begin
    update app.inventory_movements
    set notes = 'alterado'
    where id = '77400000-0000-4000-8000-000000000001';
    raise exception 'history update must fail';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'INVENTORY_HISTORY_IS_APPEND_ONLY' then raise; end if;
  end;
end;
$$;

do $$
declare
  protected_tables text[] := array[
    'inventory_item_types', 'inventory_units', 'inventory_items',
    'inventory_movements', 'inventory_reviews', 'inventory_review_lines',
    'rastra_component_changes', 'operational_novelty_categories',
    'operational_novelty_changes'
  ];
begin
  if (select count(*) from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'app'
        and relation.relname = any(protected_tables)
        and relation.relrowsecurity) <> 9 then
    raise exception 'all Sprint 7.4 tables must have RLS enabled';
  end if;
  if pg_catalog.has_table_privilege('anon', 'app.inventory_movements', 'select')
     or pg_catalog.has_table_privilege('authenticated', 'app.inventory_movements', 'insert') then
    raise exception 'browser roles must not access the private inventory tables';
  end if;
  if not pg_catalog.has_table_privilege('service_role', 'app.inventory_movements', 'select,insert')
     or pg_catalog.has_table_privilege('service_role', 'app.inventory_movements', 'update,delete') then
    raise exception 'service_role inventory history privileges are incorrect';
  end if;
  if not pg_catalog.has_table_privilege('service_role', 'app.inventory_items', 'select,insert,update') then
    raise exception 'service_role must maintain inventory catalogs';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'app'
      and table_name in ('inventory_items', 'inventory_movements')
      and lower(column_name) in ('stock', 'balance')
  ) then
    raise exception 'editable stock or balance columns are forbidden';
  end if;
end;
$$;
