-- Prueba estructural y funcional del esquema aplicado desde una base vacia.

do $$
declare
  actual_count integer;
begin
  select count(*)
    into actual_count
  from information_schema.tables
  where table_schema = 'app'
    and table_type = 'BASE TABLE';

  if actual_count <> 20 then
    raise exception 'expected 20 app tables, found %', actual_count;
  end if;

  select count(*) into actual_count from app.roles;
  if actual_count <> 3 then
    raise exception 'expected 3 roles after idempotent seed, found %', actual_count;
  end if;

  if exists (select 1 from app.roles where code = 'OPERARIO') then
    raise exception 'OPERARIO must not be an authenticated role';
  end if;

  select count(*) into actual_count from app.permissions;
  if actual_count <> 24 then
    raise exception 'expected 24 permissions, found %', actual_count;
  end if;

  select count(*) into actual_count from app.role_permissions;
  if actual_count <> 17 then
    raise exception 'expected 17 fixed role permission assignments, found %', actual_count;
  end if;

  select count(*) into actual_count from app.production_lines;
  if actual_count <> 4 then
    raise exception 'expected 4 configurable seed lines, found %', actual_count;
  end if;

  select count(*) into actual_count from app.line_components;
  if actual_count <> 16 then
    raise exception 'expected 16 seed line components, found %', actual_count;
  end if;

  if exists (
    select production_line_id
    from app.line_components components
    join app.line_component_types component_types
      on component_types.id = components.component_type_id
    group by production_line_id
    having count(*) filter (where component_types.code = 'MOLINO') <> 1
      or count(*) filter (where component_types.code = 'RASTRA') <> 3
  ) then
    raise exception 'each seed line must have one mill and three drag mills';
  end if;

  select count(*) into actual_count from app.stations;
  if actual_count <> 1 then
    raise exception 'expected one seed station, found %', actual_count;
  end if;

  select count(*) into actual_count from app.station_line_scopes;
  if actual_count <> 4 then
    raise exception 'expected the station to cover four lines, found % links', actual_count;
  end if;

  select count(*) into actual_count from app.suppliers;
  if actual_count <> 3 then
    raise exception 'expected three fictitious suppliers, found %', actual_count;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'app'
      and table_name = 'suppliers'
      and column_name = 'notes'
  ) then
    raise exception 'suppliers must remain a minimal name/contact catalog';
  end if;

  select count(*)
    into actual_count
  from pg_class relations
  join pg_namespace schemas on schemas.oid = relations.relnamespace
  where schemas.nspname = 'app'
    and relations.relkind = 'r'
    and relations.relrowsecurity;

  if actual_count <> 20 then
    raise exception 'RLS must be enabled on all 20 app tables, found %', actual_count;
  end if;

  if exists (
    select 1
    from pg_constraint constraints
    join pg_namespace schemas on schemas.oid = constraints.connamespace
    where schemas.nspname = 'app'
      and constraints.contype = 'f'
      and constraints.confdeltype = 'c'
  ) then
    raise exception 'business foreign keys must not cascade deletes';
  end if;

  if has_table_privilege('authenticated', 'app.organizations', 'select') then
    raise exception 'authenticated must not have direct table grants';
  end if;

  if has_table_privilege('anon', 'app.organizations', 'select') then
    raise exception 'anon must not have direct table grants';
  end if;

  if not has_table_privilege('service_role', 'app.organizations', 'select') then
    raise exception 'service_role must have backend table grants';
  end if;

  if has_table_privilege('service_role', 'app.organizations', 'delete') then
    raise exception 'service_role must not physically delete business rows';
  end if;
end;
$$;

set role authenticated;

do $$
begin
  begin
    perform 1 from app.organizations limit 1;
    raise exception 'authenticated must not read app tables directly';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

reset role;
set role service_role;

do $$
declare
  actual_count integer;
begin
  select count(*) into actual_count from app.organizations;
  if actual_count <> 1 then
    raise exception 'service_role must read app tables';
  end if;
end;
$$;

reset role;

do $$
begin
  insert into app.plants (
    id,
    organization_id,
    code,
    name,
    timezone
  ) values (
    '90000000-0000-4000-8000-000000000010',
    '30000000-0000-4000-8000-000000000001',
    'SECOND_PLANT',
    'Second fictitious plant',
    'America/Costa_Rica'
  );

  insert into app.production_lines (
    id,
    organization_id,
    plant_id,
    code,
    name,
    display_order
  ) values (
    '90000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000010',
    'FIFTH_LINE',
    'Fifth configurable line',
    1
  );

  insert into app.organizations (
    id,
    code,
    name
  ) values (
    '90000000-0000-4000-8000-000000000001',
    'OTHER_ORG',
    'Other fictitious organization'
  );

  insert into app.plants (
    id,
    organization_id,
    code,
    name,
    timezone
  ) values (
    '91000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001',
    'OTHER_PLANT',
    'Other fictitious plant',
    'America/Costa_Rica'
  );

  begin
    insert into app.production_lines (
      id,
      organization_id,
      plant_id,
      code,
      name,
      display_order
    ) values (
      '92000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      'CROSS_TENANT',
      'Cross tenant line',
      99
    );
    raise exception 'cross-organization foreign key must be rejected';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

do $$
begin
  begin
    insert into app.suppliers (
      id,
      organization_id,
      name
    ) values (
      '93000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '  PROVEEDOR FICTICIO 1  '
    );
    raise exception 'normalized duplicate supplier name must be rejected';
  exception
    when unique_violation then
      null;
  end;
end;
$$;
