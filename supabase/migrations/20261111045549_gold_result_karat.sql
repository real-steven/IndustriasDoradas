-- El quilataje se anota junto con el oro total del cargamento, con la misma
-- lógica append-only: cada corrección es una nueva entrada con motivo y la
-- entrada vigente es la que nadie reemplaza. Es opcional: vacío significa no
-- registrado. Rango y precisión siguen el contrato existente de quilataje
-- (0 a 24, hasta tres decimales). Las liquidaciones financieras no cambian.

alter table app.shipment_gold_result_entries
  add column karat numeric(6, 3);

alter table app.shipment_gold_result_entries
  add constraint shipment_gold_results_karat_check
  check (karat is null or (karat >= 0 and karat <= 24));

comment on column app.shipment_gold_result_entries.karat is
  'Optional karat recorded with the shipment gold total; null means not recorded.';

-- Se agrega la columna al final de cada vista para no alterar sus dependientes.
create or replace view app.management_current_shipment_gold
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
  revision_totals.revision_count,
  current_entry.karat
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

create or replace view app.management_shipment_facts
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
  ) as last_activity_at_utc,
  gold.karat as gold_karat
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
