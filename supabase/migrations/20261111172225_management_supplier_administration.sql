-- Gerencia administra proveedores desde la sección web de Personal.
--
-- Los proveedores no son usuarios: no inician sesión ni tienen planilla. Solo
-- alimentan la lista de proveedores que desktop recibe por pull incremental.
-- JEFE_PLANTA conserva su permiso actual; aquí solo se agrega a JEFE_EMPRESA.

insert into app.permissions (id, code, description)
values (
  '10000000-0000-4000-8000-000000000012',
  'suppliers.manage',
  'Gestionar proveedores.'
)
on conflict (id) do update
set code = excluded.code, description = excluded.description, is_active = true;

insert into app.role_permissions (role_id, permission_id)
select role.id, permission.id
from app.roles as role
join app.permissions as permission on permission.code = 'suppliers.manage'
where role.code = 'JEFE_EMPRESA'
on conflict (role_id, permission_id) do nothing;
