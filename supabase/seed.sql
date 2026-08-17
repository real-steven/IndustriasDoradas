-- Seed de desarrollo completamente ficticio e idempotente.
-- No crea usuarios de Auth, credenciales, PIN, trabajadores ni datos reales.

set search_path = app, public;

insert into app.roles (id, code, name_es, name_en)
values
  ('20000000-0000-4000-8000-000000000001', 'JEFE_EMPRESA', 'Jefe de empresa', 'Company manager'),
  ('20000000-0000-4000-8000-000000000002', 'ADMINISTRADOR', 'Administrador', 'Administrator'),
  ('20000000-0000-4000-8000-000000000003', 'JEFE_PLANTA', 'Jefe de planta', 'Plant manager')
on conflict (id) do update
set
  code = excluded.code,
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  is_active = true;

insert into app.permissions (id, code, description)
values
  ('10000000-0000-4000-8000-000000000001', 'reports.read', 'Consultar reportes gerenciales.'),
  ('10000000-0000-4000-8000-000000000002', 'audit.read_redacted', 'Consultar auditoria gerencial redactada.'),
  ('10000000-0000-4000-8000-000000000003', 'audit.read_operational', 'Consultar auditoria operativa necesaria.'),
  ('10000000-0000-4000-8000-000000000004', 'administrators.govern', 'Aprobar o suspender administradores.'),
  ('10000000-0000-4000-8000-000000000005', 'administrators.provision_approved', 'Aprovisionar una cuenta administrativa aprobada.'),
  ('10000000-0000-4000-8000-000000000006', 'plant_managers.manage', 'Gestionar cuentas y PIN de jefes de planta.'),
  ('10000000-0000-4000-8000-000000000007', 'organization_catalogs.read', 'Consultar catalogos organizacionales.'),
  ('10000000-0000-4000-8000-000000000008', 'organization_catalogs.manage', 'Gestionar catalogos organizacionales.'),
  ('10000000-0000-4000-8000-000000000009', 'stations.manage', 'Gestionar y revocar estaciones.'),
  ('10000000-0000-4000-8000-000000000010', 'stations.open', 'Abrir una estacion autorizada.'),
  ('10000000-0000-4000-8000-000000000011', 'privilege.elevate', 'Elevar temporalmente a modo jefe de planta.'),
  ('10000000-0000-4000-8000-000000000012', 'suppliers.manage', 'Gestionar proveedores.'),
  ('10000000-0000-4000-8000-000000000013', 'workers.request', 'Solicitar un trabajador provisional.'),
  ('10000000-0000-4000-8000-000000000014', 'workers.resolve', 'Aprobar, rechazar o fusionar trabajadores.'),
  ('10000000-0000-4000-8000-000000000015', 'cycles.correct_open', 'Corregir un ciclo operativo abierto.'),
  ('10000000-0000-4000-8000-000000000016', 'cycles.correct_closed', 'Ajustar un ciclo cerrado con auditoria.'),
  ('10000000-0000-4000-8000-000000000017', 'attendance.review_recent', 'Revisar asistencia pendiente reciente.'),
  ('10000000-0000-4000-8000-000000000018', 'attendance.correct', 'Corregir asistencia mediante ajuste auditado.'),
  ('10000000-0000-4000-8000-000000000019', 'inventory.manage', 'Gestionar inventario operativo.'),
  ('10000000-0000-4000-8000-000000000020', 'gold_deliveries.confirm', 'Confirmar o rechazar una entrega de oro.'),
  ('10000000-0000-4000-8000-000000000021', 'profile.locale_update', 'Cambiar la preferencia de idioma propia.')
on conflict (id) do update
set
  code = excluded.code,
  description = excluded.description,
  is_active = true;

with assignments (role_code, permission_code) as (
  values
    ('JEFE_EMPRESA', 'reports.read'),
    ('JEFE_EMPRESA', 'audit.read_redacted'),
    ('JEFE_EMPRESA', 'administrators.govern'),
    ('JEFE_EMPRESA', 'organization_catalogs.read'),
    ('JEFE_EMPRESA', 'gold_deliveries.confirm'),
    ('JEFE_EMPRESA', 'profile.locale_update'),
    ('ADMINISTRADOR', 'audit.read_operational'),
    ('ADMINISTRADOR', 'administrators.provision_approved'),
    ('ADMINISTRADOR', 'plant_managers.manage'),
    ('ADMINISTRADOR', 'organization_catalogs.read'),
    ('ADMINISTRADOR', 'organization_catalogs.manage'),
    ('ADMINISTRADOR', 'stations.manage'),
    ('ADMINISTRADOR', 'suppliers.manage'),
    ('ADMINISTRADOR', 'workers.resolve'),
    ('ADMINISTRADOR', 'cycles.correct_open'),
    ('ADMINISTRADOR', 'cycles.correct_closed'),
    ('ADMINISTRADOR', 'attendance.correct'),
    ('ADMINISTRADOR', 'inventory.manage'),
    ('ADMINISTRADOR', 'profile.locale_update'),
    ('JEFE_PLANTA', 'organization_catalogs.read'),
    ('JEFE_PLANTA', 'stations.open'),
    ('JEFE_PLANTA', 'privilege.elevate'),
    ('JEFE_PLANTA', 'suppliers.manage'),
    ('JEFE_PLANTA', 'workers.request'),
    ('JEFE_PLANTA', 'cycles.correct_open'),
    ('JEFE_PLANTA', 'attendance.review_recent'),
    ('JEFE_PLANTA', 'inventory.manage'),
    ('JEFE_PLANTA', 'profile.locale_update')
)
insert into app.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from assignments
join app.roles on roles.code = assignments.role_code
join app.permissions on permissions.code = assignments.permission_code
on conflict (role_id, permission_id) do nothing;

insert into app.line_component_types (id, code, name_es, name_en)
values
  ('21000000-0000-4000-8000-000000000001', 'MOLINO', 'Molino', 'Mill'),
  ('21000000-0000-4000-8000-000000000002', 'RASTRA', 'Rastra', 'Drag mill')
on conflict (id) do update
set
  code = excluded.code,
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  is_active = true;

insert into app.organizations (
  id,
  code,
  name,
  default_timezone,
  default_locale
)
values (
  '30000000-0000-4000-8000-000000000001',
  'ORG_DEMO',
  'Organizacion Ficticia de Pruebas',
  'America/Costa_Rica',
  'es'
)
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  default_timezone = excluded.default_timezone,
  default_locale = excluded.default_locale,
  is_active = true,
  deactivated_at = null;

insert into app.plants (
  id,
  organization_id,
  code,
  name,
  timezone
)
values (
  '31000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'PLANTA_DEMO',
  'Planta Ficticia de Pruebas',
  'America/Costa_Rica'
)
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  timezone = excluded.timezone,
  is_active = true,
  deactivated_at = null;

insert into app.production_lines (
  id,
  organization_id,
  plant_id,
  code,
  name,
  display_order
)
values
  ('32000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'LINEA_1', 'Linea ficticia 1', 1),
  ('32000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'LINEA_2', 'Linea ficticia 2', 2),
  ('32000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'LINEA_3', 'Linea ficticia 3', 3),
  ('32000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'LINEA_4', 'Linea ficticia 4', 4)
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  display_order = excluded.display_order,
  is_active = true,
  deactivated_at = null;

with component_rows (
  id,
  production_line_id,
  component_type_code,
  code,
  name,
  display_order
) as (
  values
    ('33000000-0000-4000-8001-000000000001'::uuid, '32000000-0000-4000-8000-000000000001'::uuid, 'MOLINO', 'MOLINO_1', 'Molino ficticio', 1),
    ('33000000-0000-4000-8001-000000000002'::uuid, '32000000-0000-4000-8000-000000000001'::uuid, 'RASTRA', 'RASTRA_1', 'Rastra ficticia 1', 2),
    ('33000000-0000-4000-8001-000000000003'::uuid, '32000000-0000-4000-8000-000000000001'::uuid, 'RASTRA', 'RASTRA_2', 'Rastra ficticia 2', 3),
    ('33000000-0000-4000-8001-000000000004'::uuid, '32000000-0000-4000-8000-000000000001'::uuid, 'RASTRA', 'RASTRA_3', 'Rastra ficticia 3', 4),
    ('33000000-0000-4000-8002-000000000001'::uuid, '32000000-0000-4000-8000-000000000002'::uuid, 'MOLINO', 'MOLINO_1', 'Molino ficticio', 1),
    ('33000000-0000-4000-8002-000000000002'::uuid, '32000000-0000-4000-8000-000000000002'::uuid, 'RASTRA', 'RASTRA_1', 'Rastra ficticia 1', 2),
    ('33000000-0000-4000-8002-000000000003'::uuid, '32000000-0000-4000-8000-000000000002'::uuid, 'RASTRA', 'RASTRA_2', 'Rastra ficticia 2', 3),
    ('33000000-0000-4000-8002-000000000004'::uuid, '32000000-0000-4000-8000-000000000002'::uuid, 'RASTRA', 'RASTRA_3', 'Rastra ficticia 3', 4),
    ('33000000-0000-4000-8003-000000000001'::uuid, '32000000-0000-4000-8000-000000000003'::uuid, 'MOLINO', 'MOLINO_1', 'Molino ficticio', 1),
    ('33000000-0000-4000-8003-000000000002'::uuid, '32000000-0000-4000-8000-000000000003'::uuid, 'RASTRA', 'RASTRA_1', 'Rastra ficticia 1', 2),
    ('33000000-0000-4000-8003-000000000003'::uuid, '32000000-0000-4000-8000-000000000003'::uuid, 'RASTRA', 'RASTRA_2', 'Rastra ficticia 2', 3),
    ('33000000-0000-4000-8003-000000000004'::uuid, '32000000-0000-4000-8000-000000000003'::uuid, 'RASTRA', 'RASTRA_3', 'Rastra ficticia 3', 4),
    ('33000000-0000-4000-8004-000000000001'::uuid, '32000000-0000-4000-8000-000000000004'::uuid, 'MOLINO', 'MOLINO_1', 'Molino ficticio', 1),
    ('33000000-0000-4000-8004-000000000002'::uuid, '32000000-0000-4000-8000-000000000004'::uuid, 'RASTRA', 'RASTRA_1', 'Rastra ficticia 1', 2),
    ('33000000-0000-4000-8004-000000000003'::uuid, '32000000-0000-4000-8000-000000000004'::uuid, 'RASTRA', 'RASTRA_2', 'Rastra ficticia 2', 3),
    ('33000000-0000-4000-8004-000000000004'::uuid, '32000000-0000-4000-8000-000000000004'::uuid, 'RASTRA', 'RASTRA_3', 'Rastra ficticia 3', 4)
)
insert into app.line_components (
  id,
  organization_id,
  production_line_id,
  component_type_id,
  code,
  name,
  display_order
)
select
  component_rows.id,
  '30000000-0000-4000-8000-000000000001',
  component_rows.production_line_id,
  line_component_types.id,
  component_rows.code,
  component_rows.name,
  component_rows.display_order
from component_rows
join app.line_component_types
  on line_component_types.code = component_rows.component_type_code
on conflict (id) do update
set
  component_type_id = excluded.component_type_id,
  code = excluded.code,
  name = excluded.name,
  display_order = excluded.display_order,
  is_active = true,
  deactivated_at = null;

insert into app.stations (
  id,
  organization_id,
  plant_id,
  code,
  name,
  device_key,
  permission_version
)
values (
  '34000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'ESTACION_1',
  'Estacion ficticia compartida',
  'station-demo-00000000-0000-4000-8000-000000000001',
  1
)
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  device_key = excluded.device_key,
  permission_version = excluded.permission_version,
  is_active = true,
  deactivated_at = null;

insert into app.station_line_scopes (
  organization_id,
  plant_id,
  station_id,
  production_line_id
)
select
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  production_lines.id
from app.production_lines
where production_lines.organization_id = '30000000-0000-4000-8000-000000000001'
on conflict (organization_id, station_id, production_line_id) do update
set
  is_active = true,
  deactivated_at = null;

insert into app.suppliers (id, organization_id, name, email, phone)
values
  ('35000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Proveedor ficticio 1', 'proveedor1@example.invalid', '+506 0000-0001'),
  ('35000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'Proveedor ficticio 2', 'proveedor2@example.invalid', '+506 0000-0002'),
  ('35000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'Proveedor ficticio 3', 'proveedor3@example.invalid', '+506 0000-0003')
on conflict (id) do update
set
  name = excluded.name,
  email = excluded.email,
  phone = excluded.phone,
  is_active = true,
  deactivated_at = null;
