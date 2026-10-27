-- Sprint 7.9: el vinculo con barrida no deriva cantidades y la asignacion es proyectada.

insert into app.inventory_item_types (
  id, organization_id, code, name, is_custom
) values (
  '79000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'PRODUCTO_QUIMICO', 'Producto químico', false
);

insert into app.inventory_units (
  id, organization_id, code, name, decimal_places, is_custom
) values (
  '79100000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'GRAMO', 'Gramo', 2, false
);

insert into app.inventory_items (
  id, organization_id, plant_id, item_type_id, unit_id, name
) values (
  '79200000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000001',
  '79100000-0000-4000-8000-000000000001',
  'Mercurio de bodega'
);

do $$
declare
  measurement_count bigint;
  measurement_total numeric;
  result jsonb;
begin
  select count(*), sum(amount_grams)
    into measurement_count, measurement_total
  from app.mercury_movements
  where organization_id = '30000000-0000-4000-8000-000000000001'
    and sweep_id = 'f4000000-0000-4000-8000-000000000001';

  result := app.record_inventory_movement_v2(
    '79300000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '79200000-0000-4000-8000-000000000001',
    '79100000-0000-4000-8000-000000000001',
    'ENTRY', 500,
    'a1000000-0000-4000-8000-000000000002', null,
    '2026-10-27T10:00:00Z', '2026-10-27T10:00:01Z',
    null, 'Bodega', 'Entrada física independiente', null, null
  );
  if result ->> 'linked_sweep_id' is not null then
    raise exception 'unlinked physical entry must remain independent';
  end if;

  perform app.record_inventory_movement_v2(
    '79300000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '79200000-0000-4000-8000-000000000001',
    '79100000-0000-4000-8000-000000000001',
    'CONSUMPTION', -100,
    'a1000000-0000-4000-8000-000000000002', null,
    '2026-10-27T10:01:00Z', '2026-10-27T10:01:01Z',
    null, 'Rastra', 'Retiro físico confirmado', null,
    'f4000000-0000-4000-8000-000000000001'
  );

  perform app.record_inventory_movement_v2(
    '79300000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '79200000-0000-4000-8000-000000000001',
    '79100000-0000-4000-8000-000000000001',
    'REVERSAL', 100,
    'a1000000-0000-4000-8000-000000000002', null,
    '2026-10-27T10:02:00Z', '2026-10-27T10:02:01Z',
    'Captura equivocada', null, null,
    '79300000-0000-4000-8000-000000000002',
    'f4000000-0000-4000-8000-000000000001'
  );

  if (select sum(quantity_delta) from app.inventory_movements
      where inventory_item_id = '79200000-0000-4000-8000-000000000001') <> 500 then
    raise exception 'linked movement and correction must have one net ledger effect';
  end if;
  if (select count(*) from app.inventory_sweep_links
      where sweep_id = 'f4000000-0000-4000-8000-000000000001'
        and inventory_movement_id in (
          '79300000-0000-4000-8000-000000000002',
          '79300000-0000-4000-8000-000000000003'
        )) <> 2 then
    raise exception 'movement and reversal must retain the same explicit sweep';
  end if;
  if (select count(*) from app.mercury_movements
      where organization_id = '30000000-0000-4000-8000-000000000001'
        and sweep_id = 'f4000000-0000-4000-8000-000000000001') <> measurement_count
     or (select sum(amount_grams) from app.mercury_movements
         where organization_id = '30000000-0000-4000-8000-000000000001'
           and sweep_id = 'f4000000-0000-4000-8000-000000000001')
        is distinct from measurement_total then
    raise exception 'inventory activity must not alter sweep measurements';
  end if;

  if not exists (
    select 1 from app.management_inventory_assignments
    where exit_movement_id = '77400000-0000-4000-8000-000000000002'
      and assigned_quantity = 4
      and returned_quantity = 2
      and pending_quantity = 2
      and assignment_status = 'ASSIGNED'
      and responsible_worker_id = 'b1000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'tool assignment must derive the pending return from immutable facts';
  end if;

  if pg_catalog.has_table_privilege(
       'authenticated', 'app.inventory_sweep_links', 'select'
     ) or pg_catalog.has_table_privilege(
       'anon', 'app.management_inventory_assignments', 'select'
     ) then
    raise exception 'browser roles must not access the private boundary';
  end if;
  if not pg_catalog.has_table_privilege(
       'service_role', 'app.management_inventory_assignments', 'select'
     ) then
    raise exception 'backend service must read tool assignments';
  end if;
end;
$$;
