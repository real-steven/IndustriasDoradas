-- Sprint 7.8: las vistas gerenciales reconstruyen inventario desde hechos.

do $$
declare
  stock app.management_inventory_stock%rowtype;
  latest_component app.management_rastra_component_history%rowtype;
begin
  select * into strict stock
  from app.management_inventory_stock
  where organization_id = '30000000-0000-4000-8000-000000000001'
    and plant_id = '31000000-0000-4000-8000-000000000001'
    and inventory_item_id = '77200000-0000-4000-8000-000000000001';

  if stock.balance <> 8
     or stock.movement_count <> 5
     or stock.first_movement_at_utc <> '2026-10-21T18:00:00Z'::timestamptz
     or stock.last_movement_at_utc <> '2026-10-21T18:04:00Z'::timestamptz then
    raise exception 'management stock must reconstruct all five ledger facts';
  end if;
  if stock.latest_review_id <> '78000000-0000-4000-8000-000000000001'
     or stock.latest_difference_quantity <> -1 then
    raise exception 'latest physical review must be projected with its difference';
  end if;

  if (select count(*)
      from app.management_inventory_review_lines
      where organization_id = stock.organization_id
        and inventory_item_id = stock.inventory_item_id
        and difference_quantity = -1) <> 2 then
    raise exception 'review history must expose the audited difference';
  end if;

  select * into strict latest_component
  from app.management_rastra_component_history
  where organization_id = stock.organization_id
    and rastra_id = '33000000-0000-4000-8001-000000000002'
  order by occurred_at_utc desc
  limit 1;

  if latest_component.installation_id <> '77600000-0000-4000-8000-000000000003'
     or not latest_component.is_active_installation then
    raise exception 'component timeline must leave only the latest installation active';
  end if;
  if (select count(*)
      from app.management_rastra_component_history
      where organization_id = stock.organization_id
        and rastra_id = latest_component.rastra_id) <> 3 then
    raise exception 'component timeline must retain installation and both replacements';
  end if;

  if pg_catalog.has_table_privilege(
       'authenticated', 'app.management_inventory_stock', 'select'
     ) or pg_catalog.has_table_privilege(
       'anon', 'app.management_rastra_component_history', 'select'
     ) then
    raise exception 'browser roles must not access management inventory views';
  end if;
  if not pg_catalog.has_table_privilege(
       'service_role', 'app.management_inventory_review_lines', 'select'
     ) then
    raise exception 'backend service must read inventory management views';
  end if;
end;
$$;
