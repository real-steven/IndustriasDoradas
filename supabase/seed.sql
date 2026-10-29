-- Seed de desarrollo completamente ficticio e idempotente.
-- Incluye catálogos y personal de demostración sin contraseñas ni PIN utilizables.

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
  ('10000000-0000-4000-8000-000000000020', 'gold_deliveries.confirm', 'Confirmar o rechazar una entrega de oro cuando gerencia delega esta capacidad.'),
  ('10000000-0000-4000-8000-000000000021', 'profile.locale_update', 'Cambiar la preferencia de idioma propia.'),
  ('10000000-0000-4000-8000-000000000022', 'administrators.create', 'Crear e invitar cuentas administrativas con permisos limitados.'),
  ('10000000-0000-4000-8000-000000000023', 'administrators.permissions.manage', 'Asignar o retirar permisos a cuentas administrativas.'),
  ('10000000-0000-4000-8000-000000000024', 'workers.read', 'Consultar trabajadores y solicitudes de trabajadores.'),
  ('10000000-0000-4000-8000-000000000025', 'gold.read', 'Consultar resultados de oro por cargamento cerrado.'),
  ('10000000-0000-4000-8000-000000000026', 'gold.results.manage', 'Registrar o corregir el total de oro de un cargamento cerrado.'),
  ('10000000-0000-4000-8000-000000000027', 'gold.deliveries.manage', 'Registrar solicitudes de entrega de oro.'),
  ('10000000-0000-4000-8000-000000000028', 'attendance.read', 'Consultar asistencia, jornadas e incidencias.'),
  ('10000000-0000-4000-8000-000000000029', 'attendance.record', 'Registrar entrada y salida desde una estación autorizada.'),
  ('10000000-0000-4000-8000-000000000030', 'attendance.pay_rates.read', 'Consultar tarifas horarias versionadas.'),
  ('10000000-0000-4000-8000-000000000031', 'attendance.pay_rates.manage', 'Configurar tarifas horarias por trabajador.')
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
    ('JEFE_EMPRESA', 'workers.read'),
    ('JEFE_EMPRESA', 'attendance.read'),
    ('JEFE_EMPRESA', 'attendance.correct'),
    ('JEFE_EMPRESA', 'attendance.pay_rates.read'),
    ('JEFE_EMPRESA', 'attendance.pay_rates.manage'),
    ('JEFE_EMPRESA', 'workers.request'),
    ('JEFE_EMPRESA', 'inventory.manage'),
    ('JEFE_EMPRESA', 'gold_deliveries.confirm'),
    ('JEFE_EMPRESA', 'profile.locale_update'),
    ('ADMINISTRADOR', 'profile.locale_update'),
    ('JEFE_PLANTA', 'organization_catalogs.read'),
    ('JEFE_PLANTA', 'stations.open'),
    ('JEFE_PLANTA', 'privilege.elevate'),
    ('JEFE_PLANTA', 'suppliers.manage'),
    ('JEFE_PLANTA', 'workers.request'),
    ('JEFE_PLANTA', 'workers.read'),
    ('JEFE_PLANTA', 'cycles.correct_open'),
    ('JEFE_PLANTA', 'attendance.review_recent'),
    ('JEFE_PLANTA', 'attendance.record'),
    ('JEFE_PLANTA', 'attendance.correct'),
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
  ('35000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Proveedor Jesús', 'jesus@example.invalid', '+506 0000-0001'),
  ('35000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'Proveedor Francisco', 'francisco@example.invalid', '+506 0000-0002'),
  ('35000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'Proveedor Lucía', 'lucia@example.invalid', '+506 0000-0003'),
  ('35000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'Proveedor Norte', 'norte@example.invalid', '+506 0000-0004'),
  ('35000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', 'Proveedor Sur', 'sur@example.invalid', '+506 0000-0005')
on conflict (id) do update
set
  name = excluded.name,
  email = excluded.email,
  phone = excluded.phone,
  is_active = true,
  deactivated_at = null;

-- Perfil técnico sin credenciales de acceso: permite relacionar las solicitudes
-- ficticias con un solicitante válido sin crear una contraseña compartida.
insert into auth.users (id, email)
values (
  '36000000-0000-4000-8000-000000000001',
  'gerencia.seed@example.invalid'
)
on conflict (id) do update
set email = excluded.email;

insert into app.user_profiles (
  id,
  organization_id,
  auth_user_id,
  role_id,
  display_name,
  preferred_locale,
  account_status
)
select
  '36100000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '36000000-0000-4000-8000-000000000001',
  roles.id,
  'Gerencia ficticia de seed',
  'es',
  'ACTIVE'
from app.roles
where roles.code = 'JEFE_EMPRESA'
on conflict (id) do update
set
  display_name = excluded.display_name,
  preferred_locale = excluded.preferred_locale,
  account_status = excluded.account_status,
  is_active = true,
  deactivated_at = null;

with demo_workers (
  request_id,
  worker_id,
  category,
  name,
  email,
  ordinal
) as (
  values
    ('37000000-0000-4000-8000-000000000001'::uuid, '37100000-0000-4000-8000-000000000001'::uuid, 'OPERARIO', 'Carlos Méndez', 'carlos.mendez@example.invalid', 1),
    ('37000000-0000-4000-8000-000000000002'::uuid, '37100000-0000-4000-8000-000000000002'::uuid, 'OPERARIO', 'Daniela Rojas', 'daniela.rojas@example.invalid', 2),
    ('37000000-0000-4000-8000-000000000003'::uuid, '37100000-0000-4000-8000-000000000003'::uuid, 'OPERARIO', 'Esteban Vargas', 'esteban.vargas@example.invalid', 3),
    ('37000000-0000-4000-8000-000000000004'::uuid, '37100000-0000-4000-8000-000000000004'::uuid, 'OPERARIO', 'Fernanda Solís', 'fernanda.solis@example.invalid', 4),
    ('37000000-0000-4000-8000-000000000005'::uuid, '37100000-0000-4000-8000-000000000005'::uuid, 'OPERARIO', 'Gabriel Jiménez', 'gabriel.jimenez@example.invalid', 5),
    ('37000000-0000-4000-8000-000000000006'::uuid, '37100000-0000-4000-8000-000000000006'::uuid, 'OPERARIO', 'Karla Mora', 'karla.mora@example.invalid', 6),
    ('37000000-0000-4000-8000-000000000007'::uuid, '37100000-0000-4000-8000-000000000007'::uuid, 'OPERARIO', 'Luis Araya', 'luis.araya@example.invalid', 7),
    ('37000000-0000-4000-8000-000000000008'::uuid, '37100000-0000-4000-8000-000000000008'::uuid, 'OPERARIO', 'Mariana Chaves', 'mariana.chaves@example.invalid', 8),
    ('37000000-0000-4000-8000-000000000009'::uuid, '37100000-0000-4000-8000-000000000009'::uuid, 'OPERARIO', 'Óscar Salazar', 'oscar.salazar@example.invalid', 9),
    ('37000000-0000-4000-8000-000000000010'::uuid, '37100000-0000-4000-8000-000000000010'::uuid, 'OPERARIO', 'Valeria Castro', 'valeria.castro@example.invalid', 10),
    ('37000000-0000-4000-8000-000000000011'::uuid, '37100000-0000-4000-8000-000000000011'::uuid, 'JEFE_PLANTA', 'Steven Demo', 'steven.demo@example.invalid', 11),
    ('37000000-0000-4000-8000-000000000012'::uuid, '37100000-0000-4000-8000-000000000012'::uuid, 'JEFE_PLANTA', 'Daniela Demo', 'daniela.demo@example.invalid', 12),
    ('37000000-0000-4000-8000-000000000013'::uuid, '37100000-0000-4000-8000-000000000013'::uuid, 'JEFE_PLANTA', 'Henry Demo', 'henry.demo@example.invalid', 13),
    ('37000000-0000-4000-8000-000000000014'::uuid, '37100000-0000-4000-8000-000000000014'::uuid, 'JEFE_PLANTA', 'Lucía Demo', 'lucia.demo@example.invalid', 14),
    ('37000000-0000-4000-8000-000000000015'::uuid, '37100000-0000-4000-8000-000000000015'::uuid, 'JEFE_PLANTA', 'Marco Demo', 'marco.demo@example.invalid', 15)
)
insert into app.worker_requests (
  id,
  organization_id,
  plant_id,
  requested_by_profile_id,
  requested_name,
  requested_email,
  status,
  requested_at,
  review_due_at,
  resolved_by_profile_id,
  resolved_at
)
select
  demo_workers.request_id,
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '36100000-0000-4000-8000-000000000001',
  demo_workers.name,
  demo_workers.email,
  'APPROVED',
  '2026-10-28T12:00:00Z'::timestamptz + make_interval(mins => demo_workers.ordinal),
  '2026-10-31T12:00:00Z'::timestamptz + make_interval(mins => demo_workers.ordinal),
  '36100000-0000-4000-8000-000000000001',
  '2026-10-28T12:00:00Z'::timestamptz + make_interval(mins => demo_workers.ordinal)
from demo_workers
on conflict (id) do update
set
  requested_name = excluded.requested_name,
  requested_email = excluded.requested_email,
  status = 'APPROVED',
  resolved_by_profile_id = excluded.resolved_by_profile_id,
  resolved_at = excluded.resolved_at;

with demo_workers (request_id, worker_id, category, name, email) as (
  values
    ('37000000-0000-4000-8000-000000000001'::uuid, '37100000-0000-4000-8000-000000000001'::uuid, 'OPERARIO', 'Carlos Méndez', 'carlos.mendez@example.invalid'),
    ('37000000-0000-4000-8000-000000000002'::uuid, '37100000-0000-4000-8000-000000000002'::uuid, 'OPERARIO', 'Daniela Rojas', 'daniela.rojas@example.invalid'),
    ('37000000-0000-4000-8000-000000000003'::uuid, '37100000-0000-4000-8000-000000000003'::uuid, 'OPERARIO', 'Esteban Vargas', 'esteban.vargas@example.invalid'),
    ('37000000-0000-4000-8000-000000000004'::uuid, '37100000-0000-4000-8000-000000000004'::uuid, 'OPERARIO', 'Fernanda Solís', 'fernanda.solis@example.invalid'),
    ('37000000-0000-4000-8000-000000000005'::uuid, '37100000-0000-4000-8000-000000000005'::uuid, 'OPERARIO', 'Gabriel Jiménez', 'gabriel.jimenez@example.invalid'),
    ('37000000-0000-4000-8000-000000000006'::uuid, '37100000-0000-4000-8000-000000000006'::uuid, 'OPERARIO', 'Karla Mora', 'karla.mora@example.invalid'),
    ('37000000-0000-4000-8000-000000000007'::uuid, '37100000-0000-4000-8000-000000000007'::uuid, 'OPERARIO', 'Luis Araya', 'luis.araya@example.invalid'),
    ('37000000-0000-4000-8000-000000000008'::uuid, '37100000-0000-4000-8000-000000000008'::uuid, 'OPERARIO', 'Mariana Chaves', 'mariana.chaves@example.invalid'),
    ('37000000-0000-4000-8000-000000000009'::uuid, '37100000-0000-4000-8000-000000000009'::uuid, 'OPERARIO', 'Óscar Salazar', 'oscar.salazar@example.invalid'),
    ('37000000-0000-4000-8000-000000000010'::uuid, '37100000-0000-4000-8000-000000000010'::uuid, 'OPERARIO', 'Valeria Castro', 'valeria.castro@example.invalid'),
    ('37000000-0000-4000-8000-000000000011'::uuid, '37100000-0000-4000-8000-000000000011'::uuid, 'JEFE_PLANTA', 'Steven Demo', 'steven.demo@example.invalid'),
    ('37000000-0000-4000-8000-000000000012'::uuid, '37100000-0000-4000-8000-000000000012'::uuid, 'JEFE_PLANTA', 'Daniela Demo', 'daniela.demo@example.invalid'),
    ('37000000-0000-4000-8000-000000000013'::uuid, '37100000-0000-4000-8000-000000000013'::uuid, 'JEFE_PLANTA', 'Henry Demo', 'henry.demo@example.invalid'),
    ('37000000-0000-4000-8000-000000000014'::uuid, '37100000-0000-4000-8000-000000000014'::uuid, 'JEFE_PLANTA', 'Lucía Demo', 'lucia.demo@example.invalid'),
    ('37000000-0000-4000-8000-000000000015'::uuid, '37100000-0000-4000-8000-000000000015'::uuid, 'JEFE_PLANTA', 'Marco Demo', 'marco.demo@example.invalid')
)
insert into app.workers (
  id,
  organization_id,
  plant_id,
  source_request_id,
  category,
  name,
  email,
  status
)
select
  demo_workers.worker_id,
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  demo_workers.request_id,
  demo_workers.category,
  demo_workers.name,
  demo_workers.email,
  'ACTIVO'
from demo_workers
on conflict (id) do update
set
  category = excluded.category,
  name = excluded.name,
  email = excluded.email,
  status = 'ACTIVO',
  is_active = true,
  deactivated_at = null;
