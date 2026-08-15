-- Industrias Doradas - esquema demostrativo para Supabase
-- Objetivo: mostrar tablas, relaciones y datos de ejemplo en Schema Visualizer.
-- IMPORTANTE: no es una migracion de produccion. Al ejecutarlo, solo reemplaza
-- el esquema aislado demo_supervisor.

drop schema if exists demo_supervisor cascade;
create schema demo_supervisor;
set search_path to demo_supervisor, public;

create type account_role as enum
  ('JEFE_EMPRESA', 'ADMINISTRADOR', 'JEFE_PLANTA', 'OPERARIO');
create type language_code as enum ('ES', 'EN');
create type shift_kind as enum ('DIA', 'NOCHE');
create type shipment_status as enum ('ABIERTO', 'EN_PROCESO', 'AGOTADO', 'CERRADO');
create type line_cycle_status as enum ('ACTIVO', 'EN_FLUJO', 'FINALIZADO');
create type production_event_kind as enum ('CAJUELA_AGREGADA', 'CAJUELA_REVERTIDA');
create type attendance_event_kind as enum ('ENTRADA', 'SALIDA');
create type gold_delivery_status as enum ('PENDIENTE', 'CONFIRMADA', 'RECHAZADA');
create type inventory_movement_kind as enum ('ENTRADA', 'CONSUMO', 'DEVOLUCION', 'AJUSTE');
create type inventory_review_status as enum ('SIN_NOVEDAD', 'CON_DIFERENCIAS');
create type operational_note_kind as enum ('PARO', 'MANTENIMIENTO', 'FERIADO', 'GENERAL');
create type sync_status as enum ('PENDIENTE', 'SINCRONIZADO', 'ERROR');

create table organizations (
  id uuid primary key,
  name text not null,
  default_language language_code not null default 'ES',
  created_at timestamptz not null default now()
);

create table plants (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  name text not null,
  timezone text not null default 'America/Costa_Rica',
  active boolean not null default true,
  unique (organization_id, name)
);

create table production_lines (
  id uuid primary key,
  plant_id uuid not null references plants(id),
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (plant_id, code)
);

create table line_components (
  id uuid primary key,
  production_line_id uuid not null references production_lines(id),
  component_type text not null check (component_type in ('MOLINO', 'RASTRA')),
  sequence_number smallint not null check (sequence_number > 0),
  active boolean not null default true,
  unique (production_line_id, component_type, sequence_number)
);

create table stations (
  id uuid primary key,
  plant_id uuid not null references plants(id),
  name text not null,
  device_code text not null unique,
  active boolean not null default true
);

create table people (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  full_name text not null,
  phone text,
  email text,
  active boolean not null default true,
  deactivated_at timestamptz
);

-- Cuenta demostrativa independiente de auth.users para que el script sea autocontenido.
create table user_accounts (
  id uuid primary key,
  person_id uuid not null references people(id),
  username text not null unique,
  preferred_language language_code not null default 'ES',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table account_roles (
  account_id uuid not null references user_accounts(id) on delete cascade,
  role account_role not null,
  primary key (account_id, role)
);

create table workers (
  id uuid primary key,
  person_id uuid not null unique references people(id),
  employee_code text not null unique,
  active boolean not null default true
);

create table suppliers (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  name text not null,
  phone text,
  email text,
  active boolean not null default true,
  unique (organization_id, name)
);

create table shipments (
  id uuid primary key,
  plant_id uuid not null references plants(id),
  supplier_id uuid not null references suppliers(id),
  reference_code text not null,
  received_at timestamptz not null,
  status shipment_status not null default 'ABIERTO',
  created_by_account_id uuid not null references user_accounts(id),
  notes text,
  unique (plant_id, reference_code)
);

-- Representa una jornada de responsabilidad, no una detencion fisica de la planta.
create table work_periods (
  id uuid primary key,
  plant_id uuid not null references plants(id),
  shift shift_kind not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  responsible_account_id uuid not null references user_accounts(id),
  closed_by_account_id uuid references user_accounts(id),
  check (ended_at is null or ended_at > started_at)
);

create table line_cycles (
  id uuid primary key,
  production_line_id uuid not null references production_lines(id),
  shipment_id uuid not null references shipments(id),
  station_id uuid references stations(id),
  principal_worker_id uuid not null references workers(id),
  status line_cycle_status not null default 'ACTIVO',
  started_at timestamptz not null,
  stopped_loading_at timestamptz,
  finished_at timestamptz,
  created_by_account_id uuid not null references user_accounts(id),
  check (stopped_loading_at is null or stopped_loading_at >= started_at),
  check (finished_at is null or finished_at >= started_at)
);

create table line_assignments (
  id uuid primary key,
  line_cycle_id uuid not null references line_cycles(id),
  worker_id uuid not null references workers(id),
  assigned_at timestamptz not null,
  unassigned_at timestamptz,
  assigned_by_account_id uuid not null references user_accounts(id),
  check (unassigned_at is null or unassigned_at >= assigned_at)
);

create table production_events (
  id uuid primary key,
  line_cycle_id uuid not null references line_cycles(id),
  work_period_id uuid not null references work_periods(id),
  station_id uuid references stations(id),
  actor_account_id uuid not null references user_accounts(id),
  event_kind production_event_kind not null,
  quantity smallint not null check (quantity in (-1, 1)),
  occurred_at timestamptz not null,
  reverses_event_id uuid references production_events(id),
  sync_state sync_status not null default 'SINCRONIZADO',
  client_event_id uuid not null unique,
  check (
    (event_kind = 'CAJUELA_AGREGADA' and quantity = 1 and reverses_event_id is null)
    or (event_kind = 'CAJUELA_REVERTIDA' and quantity = -1 and reverses_event_id is not null)
  )
);

create table sweeps (
  id uuid primary key,
  line_cycle_id uuid not null references line_cycles(id),
  sequence_number integer not null check (sequence_number > 0),
  cajuela_count integer not null check (cajuela_count > 0),
  swept_at timestamptz not null,
  recorded_by_account_id uuid not null references user_accounts(id),
  certified_by_account_id uuid references user_accounts(id),
  notes text,
  unique (line_cycle_id, sequence_number)
);

create table sweep_production_events (
  sweep_id uuid not null references sweeps(id) on delete cascade,
  production_event_id uuid not null unique references production_events(id),
  primary key (sweep_id, production_event_id)
);

create table mercury_usages (
  id uuid primary key,
  sweep_id uuid not null references sweeps(id),
  amount_grams numeric(12,3) not null check (amount_grams >= 0),
  recorded_at timestamptz not null,
  recorded_by_account_id uuid not null references user_accounts(id)
);

create table gold_results (
  id uuid primary key,
  sweep_id uuid not null unique references sweeps(id),
  preliminary_grams numeric(12,3) check (preliminary_grams >= 0),
  definitive_grams numeric(12,3) check (definitive_grams >= 0),
  certified_at timestamptz,
  certified_by_account_id uuid references user_accounts(id),
  notes text
);

create table gold_deliveries (
  id uuid primary key,
  plant_id uuid not null references plants(id),
  requested_grams numeric(12,3) not null check (requested_grams > 0),
  confirmed_grams numeric(12,3) check (confirmed_grams >= 0),
  status gold_delivery_status not null default 'PENDIENTE',
  requested_at timestamptz not null,
  requested_by_account_id uuid not null references user_accounts(id),
  reviewed_at timestamptz,
  reviewed_by_account_id uuid references user_accounts(id),
  rejection_reason text
);

create table gold_delivery_allocations (
  gold_delivery_id uuid not null references gold_deliveries(id) on delete cascade,
  gold_result_id uuid not null references gold_results(id),
  allocated_grams numeric(12,3) not null check (allocated_grams > 0),
  primary key (gold_delivery_id, gold_result_id)
);

create table attendance_events (
  id uuid primary key,
  worker_id uuid not null references workers(id),
  plant_id uuid not null references plants(id),
  station_id uuid references stations(id),
  work_period_id uuid references work_periods(id),
  event_kind attendance_event_kind not null,
  occurred_at timestamptz not null,
  biometric_verified boolean not null default false,
  pending_approval boolean not null default false,
  approved_at timestamptz,
  approved_by_account_id uuid references user_accounts(id),
  evidence_path text,
  client_event_id uuid not null unique
);

create table attendance_adjustments (
  id uuid primary key,
  attendance_event_id uuid not null references attendance_events(id),
  previous_occurred_at timestamptz not null,
  corrected_occurred_at timestamptz not null,
  reason text not null,
  adjusted_at timestamptz not null,
  adjusted_by_account_id uuid not null references user_accounts(id)
);

create table inventory_items (
  id uuid primary key,
  plant_id uuid not null references plants(id),
  name text not null,
  unit_name text not null default 'unidad',
  active boolean not null default true,
  unique (plant_id, name)
);

create table inventory_movements (
  id uuid primary key,
  inventory_item_id uuid not null references inventory_items(id),
  movement_kind inventory_movement_kind not null,
  quantity_delta numeric(12,3) not null check (quantity_delta <> 0),
  occurred_at timestamptz not null,
  reason text,
  recorded_by_account_id uuid not null references user_accounts(id),
  related_mercury_usage_id uuid references mercury_usages(id),
  reverses_movement_id uuid references inventory_movements(id)
);

create table inventory_reviews (
  id uuid primary key,
  plant_id uuid not null references plants(id),
  reviewed_at timestamptz not null,
  status inventory_review_status not null,
  reviewed_by_account_id uuid not null references user_accounts(id),
  notes text
);

create table inventory_review_details (
  inventory_review_id uuid not null references inventory_reviews(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id),
  expected_quantity numeric(12,3) not null,
  counted_quantity numeric(12,3) not null,
  primary key (inventory_review_id, inventory_item_id)
);

create table operational_notes (
  id uuid primary key,
  plant_id uuid not null references plants(id),
  production_line_id uuid references production_lines(id),
  note_kind operational_note_kind not null,
  description text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_by_account_id uuid not null references user_accounts(id),
  check (ended_at is null or ended_at >= started_at)
);

create table sync_clients (
  id uuid primary key,
  station_id uuid not null unique references stations(id),
  last_successful_sync_at timestamptz,
  pending_event_count integer not null default 0 check (pending_event_count >= 0),
  last_error text
);

create table audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations(id),
  actor_account_id uuid references user_accounts(id),
  station_id uuid references stations(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  occurred_at timestamptz not null default now(),
  reason text,
  before_data jsonb,
  after_data jsonb
);

create index ix_shipments_supplier on shipments(supplier_id);
create index ix_line_cycles_shipment on line_cycles(shipment_id);
create index ix_production_events_cycle_time on production_events(line_cycle_id, occurred_at);
create index ix_attendance_worker_time on attendance_events(worker_id, occurred_at);
create index ix_inventory_movements_item_time on inventory_movements(inventory_item_id, occurred_at);
create index ix_audit_entity on audit_events(entity_type, entity_id, occurred_at);

create view v_line_cycle_cajuelas as
select lc.id as line_cycle_id, pl.code as line_code, s.reference_code as shipment,
       sum(pe.quantity)::integer as total_cajuelas,
       (sum(pe.quantity) / 50)::integer as alertas_50_alcanzadas
from line_cycles lc
join production_lines pl on pl.id = lc.production_line_id
join shipments s on s.id = lc.shipment_id
left join production_events pe on pe.line_cycle_id = lc.id
group by lc.id, pl.code, s.reference_code;

create view v_shipment_gold_totals as
select s.id as shipment_id, s.reference_code, sp.name as supplier,
       coalesce(sum(gr.definitive_grams), 0)::numeric(12,3) as definitive_gold_grams
from shipments s
join suppliers sp on sp.id = s.supplier_id
left join line_cycles lc on lc.shipment_id = s.id
left join sweeps sw on sw.line_cycle_id = lc.id
left join gold_results gr on gr.sweep_id = sw.id
group by s.id, s.reference_code, sp.name;

create view v_inventory_balances as
select i.id as inventory_item_id, i.name, i.unit_name,
       coalesce(sum(m.quantity_delta), 0)::numeric(12,3) as current_quantity
from inventory_items i
left join inventory_movements m on m.inventory_item_id = i.id
group by i.id, i.name, i.unit_name;

-- Datos ficticios para que las relaciones y vistas se aprecien de inmediato.
insert into organizations values
('00000000-0000-0000-0000-000000000001', 'Industrias Doradas', 'ES', now());
insert into plants values
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Planta principal', 'America/Costa_Rica', true);

insert into production_lines (id, plant_id, code, name) values
('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','L1','Linea 1'),
('11000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','L2','Linea 2'),
('11000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','L3','Linea 3'),
('11000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','L4','Linea 4');

insert into line_components (id, production_line_id, component_type, sequence_number)
select (substr(md5(pl.id::text || c.kind || c.seq),1,8)||'-'||substr(md5(pl.id::text || c.kind || c.seq),9,4)||'-4'||substr(md5(pl.id::text || c.kind || c.seq),14,3)||'-8'||substr(md5(pl.id::text || c.kind || c.seq),18,3)||'-'||substr(md5(pl.id::text || c.kind || c.seq),21,12))::uuid,
       pl.id, c.kind, c.seq
from production_lines pl
cross join (values ('MOLINO',1),('RASTRA',1),('RASTRA',2),('RASTRA',3)) c(kind,seq);

insert into stations values
('12000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Control central','PLANTA-PC-01',true);

insert into people (id, organization_id, full_name, email) values
('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Gerente Demo','gerencia@demo.local'),
('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Administrador Demo','admin@demo.local'),
('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Jefe de Planta Demo','jefe@demo.local'),
('20000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Juan Operario',null),
('20000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','Pedro Operario',null);

insert into user_accounts values
('21000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','gerencia.demo','ES',true,now()),
('21000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','admin.demo','ES',true,now()),
('21000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','jefe.planta','ES',true,now()),
('21000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','juan.operario','ES',true,now());
insert into account_roles values
('21000000-0000-0000-0000-000000000001','JEFE_EMPRESA'),
('21000000-0000-0000-0000-000000000002','ADMINISTRADOR'),
('21000000-0000-0000-0000-000000000003','JEFE_PLANTA'),
('21000000-0000-0000-0000-000000000004','OPERARIO');
insert into workers values
('22000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','OP-001',true),
('22000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000005','OP-002',true);

insert into suppliers values
('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Proveedor La Esperanza','8888-0001',null,true),
('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Proveedor El Dorado','8888-0002',null,true);
insert into shipments values
('31000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','ESP-2026-001','2026-08-13 06:00:00-06','EN_PROCESO','21000000-0000-0000-0000-000000000003','Cargamento ficticio para demostracion');
insert into work_periods values
('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','DIA','2026-08-13 06:00:00-06',null,'21000000-0000-0000-0000-000000000003',null);
insert into line_cycles values
('41000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','ACTIVO','2026-08-13 06:10:00-06',null,null,'21000000-0000-0000-0000-000000000003');
insert into line_assignments values
('42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','2026-08-13 06:10:00-06',null,'21000000-0000-0000-0000-000000000003');

insert into production_events values
('50000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000004','CAJUELA_AGREGADA',1,'2026-08-13 06:15:00-06',null,'SINCRONIZADO','51000000-0000-0000-0000-000000000001'),
('50000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000004','CAJUELA_AGREGADA',1,'2026-08-13 06:16:00-06',null,'SINCRONIZADO','51000000-0000-0000-0000-000000000002'),
('50000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000004','CAJUELA_AGREGADA',1,'2026-08-13 06:17:00-06',null,'SINCRONIZADO','51000000-0000-0000-0000-000000000003');
insert into sweeps values
('52000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',1,3,'2026-08-13 08:30:00-06','21000000-0000-0000-0000-000000000003','21000000-0000-0000-0000-000000000003','Barrida demostrativa; en operacion normalmente ocurre cerca de 50 cajuelas');
insert into sweep_production_events values
('52000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001'),
('52000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002'),
('52000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003');
insert into mercury_usages values
('53000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001',12.500,'2026-08-13 08:35:00-06','21000000-0000-0000-0000-000000000003');
insert into gold_results values
('54000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001',1.200,1.100,'2026-08-13 09:00:00-06','21000000-0000-0000-0000-000000000003','Resultado certificado de demostracion');
insert into gold_deliveries values
('55000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',1.100,1.100,'CONFIRMADA','2026-08-13 10:00:00-06','21000000-0000-0000-0000-000000000003','2026-08-13 12:00:00-06','21000000-0000-0000-0000-000000000001',null);
insert into gold_delivery_allocations values
('55000000-0000-0000-0000-000000000001','54000000-0000-0000-0000-000000000001',1.100);

insert into attendance_events values
('60000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','ENTRADA','2026-08-13 05:58:00-06',false,true,'2026-08-13 06:05:00-06','21000000-0000-0000-0000-000000000003','demo/check-in-op001.jpg','61000000-0000-0000-0000-000000000001');

insert into inventory_items values
('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Palas','unidad',true),
('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Taladros','unidad',true),
('70000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Mercurio','gramo',true);
insert into inventory_movements values
('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','ENTRADA',10,'2026-08-13 06:00:00-06','Inventario inicial','21000000-0000-0000-0000-000000000003',null,null),
('71000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002','ENTRADA',2,'2026-08-13 06:00:00-06','Inventario inicial','21000000-0000-0000-0000-000000000003',null,null),
('71000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000003','ENTRADA',100,'2026-08-13 06:00:00-06','Inventario inicial','21000000-0000-0000-0000-000000000003',null,null),
('71000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000003','CONSUMO',-12.5,'2026-08-13 08:35:00-06','Uso en barrida','21000000-0000-0000-0000-000000000003','53000000-0000-0000-0000-000000000001',null);
insert into inventory_reviews values
('72000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-08-13 18:00:00-06','SIN_NOVEDAD','21000000-0000-0000-0000-000000000003','Revision demostrativa');
insert into inventory_review_details values
('72000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',10,10),
('72000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002',2,2);

insert into operational_notes values
('80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','MANTENIMIENTO','Revision preventiva de molino','2026-08-13 07:00:00-06','2026-08-13 07:30:00-06','21000000-0000-0000-0000-000000000003');
insert into sync_clients values
('81000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','2026-08-13 12:05:00-06',0,null);
insert into audit_events (organization_id, actor_account_id, station_id, action, entity_type, entity_id, occurred_at, reason, after_data) values
('00000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000002',null,'UPDATE','gold_deliveries','55000000-0000-0000-0000-000000000001','2026-08-13 12:00:00-06','Confirmacion de entrega de demostracion','{"status":"CONFIRMADA","confirmed_grams":1.1}'::jsonb);

comment on schema demo_supervisor is 'Modelo relacional demostrativo de Industrias Doradas; no usar como migracion de produccion.';
comment on table production_events is 'Bitacora inmutable de cajuelas; las reversiones se registran como eventos relacionados.';
comment on table audit_events is 'Auditoria de cambios sensibles realizados desde web o escritorio.';
comment on view v_shipment_gold_totals is 'Oro definitivo acumulado por cargamento y proveedor.';

-- Permisos de solo lectura para demostracion. El esquema no queda expuesto por la API
-- hasta que se agregue manualmente a Exposed schemas en Supabase.
grant usage on schema demo_supervisor to anon, authenticated, service_role;
grant select on all tables in schema demo_supervisor to anon, authenticated, service_role;
grant usage, select on all sequences in schema demo_supervisor to anon, authenticated, service_role;

-- Consultas rapidas posteriores a la ejecucion:
-- select * from demo_supervisor.v_line_cycle_cajuelas;
-- select * from demo_supervisor.v_shipment_gold_totals;
-- select * from demo_supervisor.v_inventory_balances;
