create view app.management_statistics_daily
with (security_invoker = true)
as
select
  facts.organization_id,
  facts.plant_id,
  (facts.completed_at_utc at time zone 'America/Costa_Rica')::date as local_date,
  facts.production_line_id,
  facts.production_line_name,
  facts.production_line_order,
  facts.supplier_id,
  facts.supplier_name,
  count(*)::integer as completed_shipments,
  coalesce(sum(facts.cajuela_total), 0)::bigint as total_cajuelas,
  coalesce(sum(facts.sweep_count), 0)::bigint as sweep_count,
  count(*) filter (where facts.has_gold_result)::integer as gold_shipments,
  coalesce(
    sum(facts.gold_amount_grams) filter (where facts.has_gold_result),
    0
  )::numeric(18, 4) as gold_grams,
  coalesce(
    sum(facts.cajuela_total) filter (where facts.has_gold_result),
    0
  )::bigint as gold_cajuelas,
  coalesce(
    sum(extract(epoch from (facts.completed_at_utc - facts.started_at_utc))),
    0
  )::numeric(18, 3) as duration_seconds
from app.management_shipment_facts as facts
where facts.status = 'COMPLETED'
  and facts.completed_at_utc is not null
group by
  facts.organization_id,
  facts.plant_id,
  (facts.completed_at_utc at time zone 'America/Costa_Rica')::date,
  facts.production_line_id,
  facts.production_line_name,
  facts.production_line_order,
  facts.supplier_id,
  facts.supplier_name;

revoke all on table app.management_statistics_daily
from public, anon, authenticated;
grant select on table app.management_statistics_daily to service_role;

comment on view app.management_statistics_daily is
  'Agregados diarios gerenciales por planta, linea y proveedor en la zona horaria de Costa Rica.';
