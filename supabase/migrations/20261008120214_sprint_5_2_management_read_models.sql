-- Sprint 5.2: fuente única de totales para el portal gerencial.
-- Las vistas son convencionales para no servir operación obsoleta. El esquema
-- app permanece privado y solo el API (service_role) puede consultarlo.

create table app.shipment_gold_result_entries (
  id uuid primary key,
  organization_id uuid not null,
  shipment_id uuid not null,
  amount_grams numeric not null,
  unit_code text not null default 'g',
  recorded_at_utc timestamptz not null,
  recorded_by_profile_id uuid not null,
  supersedes_result_id uuid,
  correction_reason text,
  created_at timestamptz not null default now(),
  constraint shipment_gold_results_organization_id_id_unique
    unique (organization_id, id),
  constraint shipment_gold_results_shipment_fk
    foreign key (organization_id, shipment_id)
    references app.shipments (organization_id, id) on delete restrict,
  constraint shipment_gold_results_recorded_by_fk
    foreign key (organization_id, recorded_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint shipment_gold_results_supersedes_fk
    foreign key (organization_id, supersedes_result_id)
    references app.shipment_gold_result_entries (organization_id, id) on delete restrict,
  constraint shipment_gold_results_amount_check
    check (amount_grams >= 0 and scale(amount_grams) <= 2),
  constraint shipment_gold_results_unit_check check (unit_code = 'g'),
  constraint shipment_gold_results_reason_check check (
    (supersedes_result_id is null and correction_reason is null)
    or (
      supersedes_result_id is not null
      and btrim(coalesce(correction_reason, '')) <> ''
    )
  ),
  constraint shipment_gold_results_distinct_correction_check
    check (supersedes_result_id is null or supersedes_result_id <> id)
);

create unique index ux_shipment_gold_results_initial
  on app.shipment_gold_result_entries (organization_id, shipment_id)
  where supersedes_result_id is null;
create unique index ux_shipment_gold_results_superseded_once
  on app.shipment_gold_result_entries (organization_id, supersedes_result_id)
  where supersedes_result_id is not null;
create index ix_shipment_gold_results_supersedes_fk
  on app.shipment_gold_result_entries (organization_id, supersedes_result_id);
create index ix_shipment_gold_results_shipment_time
  on app.shipment_gold_result_entries (
    organization_id, shipment_id, recorded_at_utc desc, id
  );
create index ix_shipment_gold_results_recorded_by
  on app.shipment_gold_result_entries (organization_id, recorded_by_profile_id);

create function app.validate_shipment_gold_result()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  shipment_status text;
  previous app.shipment_gold_result_entries%rowtype;
begin
  select shipments.status into shipment_status
  from app.shipments as shipments
  where shipments.organization_id = new.organization_id
    and shipments.id = new.shipment_id;

  if shipment_status is distinct from 'COMPLETED' then
    raise exception using
      errcode = '23514',
      message = 'GOLD_REQUIRES_COMPLETED_SHIPMENT';
  end if;

  if new.supersedes_result_id is not null then
    select entries.* into previous
    from app.shipment_gold_result_entries as entries
    where entries.organization_id = new.organization_id
      and entries.id = new.supersedes_result_id;

    if not found or previous.shipment_id <> new.shipment_id then
      raise exception using
        errcode = '23514',
        message = 'GOLD_CORRECTION_CONTEXT_MISMATCH';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_validate_shipment_gold_result
before insert on app.shipment_gold_result_entries
for each row execute function app.validate_shipment_gold_result();

create trigger trg_shipment_gold_results_append_only
before update or delete on app.shipment_gold_result_entries
for each row execute function app.reject_sprint_4_history_mutation();

alter table app.shipment_gold_result_entries enable row level security;
create policy backend_service_all
  on app.shipment_gold_result_entries
  for all to service_role using (true) with check (true);
revoke all on table app.shipment_gold_result_entries from public, anon, authenticated;
grant select, insert on table app.shipment_gold_result_entries to service_role;

create index ix_shipments_management_completed
  on app.shipments (
    organization_id, plant_id, completed_at_utc desc, id
  ) include (production_line_id, supplier_id, station_id)
  where status = 'COMPLETED';
create index ix_shipments_management_active
  on app.shipments (
    organization_id, plant_id, production_line_id, started_at_utc desc, id
  ) include (supplier_id, station_id)
  where status = 'ACTIVE';

create view app.management_current_shipment_gold
with (security_invoker = true)
as
with revision_totals as (
  select
    entries.organization_id,
    entries.shipment_id,
    count(*)::integer as revision_count
  from app.shipment_gold_result_entries as entries
  group by entries.organization_id, entries.shipment_id
)
select
  current_entry.organization_id,
  current_entry.shipment_id,
  current_entry.id as result_id,
  current_entry.amount_grams,
  current_entry.unit_code,
  current_entry.recorded_at_utc,
  current_entry.recorded_by_profile_id,
  current_entry.supersedes_result_id,
  current_entry.correction_reason,
  revision_totals.revision_count
from app.shipment_gold_result_entries as current_entry
join revision_totals
  on revision_totals.organization_id = current_entry.organization_id
 and revision_totals.shipment_id = current_entry.shipment_id
where not exists (
  select 1
  from app.shipment_gold_result_entries as correction
  where correction.organization_id = current_entry.organization_id
    and correction.supersedes_result_id = current_entry.id
);

create view app.management_sweep_mercury
with (security_invoker = true)
as
with current_movements as (
  select movements.*
  from app.mercury_movements as movements
  where movements.movement_kind in ('SWEEP_INPUT', 'SWEEP_REMAINDER')
    and not exists (
      select 1
      from app.mercury_movements as correction
      where correction.organization_id = movements.organization_id
        and correction.supersedes_movement_id = movements.id
    )
)
select
  sweeps.organization_id,
  sweeps.shipment_id,
  sweeps.id as sweep_id,
  sweeps.swept_at_utc,
  sweeps.cajuela_count,
  components.id as line_component_id,
  components.name as line_component_name,
  components.display_order as line_component_order,
  max(current_movements.amount_grams)
    filter (where current_movements.movement_kind = 'SWEEP_INPUT') as input_grams,
  max(current_movements.amount_grams)
    filter (where current_movements.movement_kind = 'SWEEP_REMAINDER') as remainder_grams,
  bool_or(current_movements.movement_kind = 'SWEEP_INPUT') as has_input_record,
  bool_or(current_movements.movement_kind = 'SWEEP_REMAINDER') as has_remainder_record
from app.production_sweeps as sweeps
join app.line_components as components
  on components.organization_id = sweeps.organization_id
 and components.production_line_id = sweeps.production_line_id
join app.line_component_types as component_types
  on component_types.id = components.component_type_id
 and component_types.code = 'RASTRA'
left join current_movements
  on current_movements.organization_id = sweeps.organization_id
 and current_movements.shipment_id = sweeps.shipment_id
 and current_movements.sweep_id = sweeps.id
 and current_movements.line_component_id = components.id
group by
  sweeps.organization_id,
  sweeps.shipment_id,
  sweeps.id,
  sweeps.swept_at_utc,
  sweeps.cajuela_count,
  components.id,
  components.name,
  components.display_order;

create view app.management_shipment_facts
with (security_invoker = true)
as
with production as (
  select
    events.organization_id,
    events.shipment_id,
    coalesce(sum(events.quantity_delta), 0)::integer as cajuela_total,
    max(events.recorded_at_utc) as last_production_at_utc
  from app.production_events as events
  group by events.organization_id, events.shipment_id
),
sweeps as (
  select
    production_sweeps.organization_id,
    production_sweeps.shipment_id,
    count(*)::integer as sweep_count,
    coalesce(sum(production_sweeps.cajuela_count), 0)::integer as swept_cajuelas,
    max(production_sweeps.recorded_at_utc) as last_sweep_at_utc
  from app.production_sweeps
  group by production_sweeps.organization_id, production_sweeps.shipment_id
),
mercury as (
  select
    movements.organization_id,
    movements.shipment_id,
    max(movements.recorded_at_utc) as last_mercury_at_utc
  from app.mercury_movements as movements
  group by movements.organization_id, movements.shipment_id
)
select
  shipments.organization_id,
  shipments.plant_id,
  shipments.station_id,
  stations.name as station_name,
  shipments.id as shipment_id,
  shipments.feed_cycle_id,
  shipments.status,
  shipments.started_at_utc,
  shipments.completed_at_utc,
  shipments.production_line_id,
  production_lines.name as production_line_name,
  production_lines.display_order as production_line_order,
  shipments.supplier_id,
  suppliers.name as supplier_name,
  responsibility.worker_id as responsible_worker_id,
  responsibility.worker_name as responsible_worker_name,
  coalesce(production.cajuela_total, 0) as cajuela_total,
  coalesce(sweeps.sweep_count, 0) as sweep_count,
  coalesce(sweeps.swept_cajuelas, 0) as swept_cajuelas,
  coalesce(production.cajuela_total, 0) - coalesce(sweeps.swept_cajuelas, 0)
    as cajuelas_since_last_sweep,
  coalesce(sweeps.swept_cajuelas, 0) + 250 as next_sweep_at,
  (
    coalesce(production.cajuela_total, 0) - coalesce(sweeps.swept_cajuelas, 0)
  ) >= 250 as sweep_pending,
  gold.result_id as gold_result_id,
  gold.amount_grams as gold_amount_grams,
  gold.unit_code as gold_unit_code,
  gold.recorded_at_utc as gold_recorded_at_utc,
  gold.recorded_by_profile_id as gold_recorded_by_profile_id,
  gold.revision_count as gold_revision_count,
  gold.result_id is not null as has_gold_result,
  greatest(
    shipments.started_at_utc,
    coalesce(shipments.completed_at_utc, '-infinity'::timestamptz),
    coalesce(production.last_production_at_utc, '-infinity'::timestamptz),
    coalesce(sweeps.last_sweep_at_utc, '-infinity'::timestamptz),
    coalesce(mercury.last_mercury_at_utc, '-infinity'::timestamptz),
    coalesce(gold.recorded_at_utc, '-infinity'::timestamptz)
  ) as last_activity_at_utc
from app.shipments
join app.stations
  on stations.organization_id = shipments.organization_id
 and stations.id = shipments.station_id
join app.production_lines
  on production_lines.organization_id = shipments.organization_id
 and production_lines.id = shipments.production_line_id
join app.suppliers
  on suppliers.organization_id = shipments.organization_id
 and suppliers.id = shipments.supplier_id
left join production
  on production.organization_id = shipments.organization_id
 and production.shipment_id = shipments.id
left join sweeps
  on sweeps.organization_id = shipments.organization_id
 and sweeps.shipment_id = shipments.id
left join mercury
  on mercury.organization_id = shipments.organization_id
 and mercury.shipment_id = shipments.id
left join app.management_current_shipment_gold as gold
  on gold.organization_id = shipments.organization_id
 and gold.shipment_id = shipments.id
left join lateral (
  select
    assignments.worker_id,
    workers.name as worker_name
  from app.responsibility_assignments as assignments
  join app.workers
    on workers.organization_id = assignments.organization_id
   and workers.id = assignments.worker_id
  where assignments.organization_id = shipments.organization_id
    and assignments.shipment_id = shipments.id
  order by assignments.started_at_utc desc, assignments.id desc
  limit 1
) as responsibility on true;

create view app.management_operation_lines
with (security_invoker = true)
as
select
  facts.organization_id,
  facts.plant_id,
  facts.station_id,
  facts.station_name,
  facts.shipment_id,
  facts.feed_cycle_id,
  facts.production_line_id,
  facts.production_line_name,
  facts.production_line_order,
  facts.supplier_id,
  facts.supplier_name,
  facts.responsible_worker_id,
  facts.responsible_worker_name,
  facts.started_at_utc,
  facts.cajuela_total,
  facts.sweep_count,
  facts.swept_cajuelas,
  facts.cajuelas_since_last_sweep,
  facts.next_sweep_at,
  facts.sweep_pending,
  facts.last_activity_at_utc
from app.management_shipment_facts as facts
where facts.status = 'ACTIVE';

revoke all on table
  app.management_current_shipment_gold,
  app.management_sweep_mercury,
  app.management_shipment_facts,
  app.management_operation_lines
from public, anon, authenticated;
grant select on table
  app.management_current_shipment_gold,
  app.management_sweep_mercury,
  app.management_shipment_facts,
  app.management_operation_lines
to service_role;

update app.permissions
set description = 'Consultar resultados de oro por cargamento cerrado.'
where code = 'gold.read';
update app.permissions
set description = 'Registrar o corregir el total de oro de un cargamento cerrado.'
where code = 'gold.results.manage';

comment on table app.shipment_gold_result_entries is
  'Historial append-only del unico resultado opcional de oro por cargamento cerrado.';
comment on table app.gold_result_entries is
  'Modelo legado de oro por barrida. No usar para lecturas o escrituras nuevas del portal gerencial.';
comment on table app.gold_deliveries is
  'Modelo legado fuera del alcance actual: el MVP no registra custodia ni entregas de oro.';
comment on view app.management_shipment_facts is
  'Fuente canonica de totales por cargamento; incluye reversos y datos tardios confirmados.';
comment on view app.management_operation_lines is
  'Proyeccion actual no materializada para las lineas con cargamento activo.';
comment on view app.management_sweep_mercury is
  'Medicion vigente de entrada y remanente por barrida y rastra.';
