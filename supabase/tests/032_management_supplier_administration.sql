-- Gerencia administra proveedores; el jefe de planta conserva su permiso y
-- «Material propio» sigue disponible como proveedor activo.

reset role;

do $$
begin
  if not exists (
    select 1
    from app.role_permissions as grant_row
    join app.roles as role on role.id = grant_row.role_id
    join app.permissions as permission on permission.id = grant_row.permission_id
    where role.code = 'JEFE_EMPRESA'
      and permission.code = 'suppliers.manage'
      and permission.is_active
  ) then
    raise exception 'JEFE_EMPRESA must manage suppliers';
  end if;

  if not exists (
    select 1
    from app.role_permissions as grant_row
    join app.roles as role on role.id = grant_row.role_id
    join app.permissions as permission on permission.id = grant_row.permission_id
    where role.code = 'JEFE_PLANTA'
      and permission.code = 'suppliers.manage'
  ) then
    raise exception 'JEFE_PLANTA must keep supplier management';
  end if;

  if not exists (
    select 1
    from app.suppliers
    where organization_id = '30000000-0000-4000-8000-000000000001'
      and lower(btrim(name)) = 'material propio'
      and is_active
  ) then
    raise exception 'Material propio must remain an active supplier';
  end if;
end;
$$;
