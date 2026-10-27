-- Sprint 7.8: proyecciones gerenciales de inventario.
-- Las vistas reconstruyen existencias, revisiones e historial de componentes
-- desde los hechos append-only; no almacenan saldos ni estados derivados.

create view app.management_inventory_stock
with (security_invoker = true)
as
with movement_facts as (
  select
    movements.organization_id,
    movements.plant_id,
    movements.inventory_item_id,
    sum(movements.quantity_delta)::numeric(18, 3) as balance,
    min(movements.occurred_at_utc) as first_movement_at_utc,
    max(movements.occurred_at_utc) as last_movement_at_utc,
    count(*)::integer as movement_count
  from app.inventory_movements as movements
  group by
    movements.organization_id,
    movements.plant_id,
    movements.inventory_item_id
), latest_review as (
  select distinct on (
    lines.organization_id,
    lines.plant_id,
    lines.inventory_item_id
  )
    lines.organization_id,
    lines.plant_id,
    lines.inventory_item_id,
    reviews.id as review_id,
    reviews.status as review_status,
    reviews.reviewed_at_utc,
    lines.expected_quantity,
    lines.counted_quantity,
    lines.difference_quantity
  from app.inventory_review_lines as lines
  join app.inventory_reviews as reviews
    on reviews.organization_id = lines.organization_id
   and reviews.plant_id = lines.plant_id
   and reviews.id = lines.review_id
  order by
    lines.organization_id,
    lines.plant_id,
    lines.inventory_item_id,
    reviews.reviewed_at_utc desc,
    reviews.id desc
)
select
  items.organization_id,
  items.plant_id,
  items.id as inventory_item_id,
  items.name as inventory_item_name,
  items.is_active,
  item_types.id as item_type_id,
  item_types.name as item_type_name,
  units.id as unit_id,
  units.code as unit_code,
  units.name as unit_name,
  units.decimal_places,
  coalesce(movement_facts.balance, 0)::numeric(18, 3) as balance,
  movement_facts.first_movement_at_utc,
  movement_facts.last_movement_at_utc,
  coalesce(movement_facts.movement_count, 0)::integer as movement_count,
  latest_review.review_id as latest_review_id,
  latest_review.review_status as latest_review_status,
  latest_review.reviewed_at_utc as latest_reviewed_at_utc,
  latest_review.expected_quantity as latest_expected_quantity,
  latest_review.counted_quantity as latest_counted_quantity,
  latest_review.difference_quantity as latest_difference_quantity
from app.inventory_items as items
join app.inventory_item_types as item_types
  on item_types.organization_id = items.organization_id
 and item_types.id = items.item_type_id
join app.inventory_units as units
  on units.organization_id = items.organization_id
 and units.id = items.unit_id
left join movement_facts
  on movement_facts.organization_id = items.organization_id
 and movement_facts.plant_id = items.plant_id
 and movement_facts.inventory_item_id = items.id
left join latest_review
  on latest_review.organization_id = items.organization_id
 and latest_review.plant_id = items.plant_id
 and latest_review.inventory_item_id = items.id;

create view app.management_inventory_review_lines
with (security_invoker = true)
as
select
  reviews.organization_id,
  reviews.plant_id,
  reviews.id as review_id,
  reviews.status,
  reviews.reviewed_by_profile_id,
  profiles.display_name as reviewed_by_display_name,
  reviews.reviewed_at_utc,
  reviews.recorded_at_utc,
  reviews.notes,
  lines.inventory_item_id,
  items.name as inventory_item_name,
  lines.unit_id,
  units.code as unit_code,
  units.name as unit_name,
  lines.expected_quantity,
  lines.counted_quantity,
  lines.difference_quantity
from app.inventory_reviews as reviews
join app.inventory_review_lines as lines
  on lines.organization_id = reviews.organization_id
 and lines.plant_id = reviews.plant_id
 and lines.review_id = reviews.id
join app.inventory_items as items
  on items.organization_id = lines.organization_id
 and items.plant_id = lines.plant_id
 and items.id = lines.inventory_item_id
join app.inventory_units as units
  on units.organization_id = lines.organization_id
 and units.id = lines.unit_id
join app.user_profiles as profiles
  on profiles.organization_id = reviews.organization_id
 and profiles.id = reviews.reviewed_by_profile_id;

create view app.management_rastra_component_history
with (security_invoker = true)
as
select
  changes.organization_id,
  changes.plant_id,
  changes.id,
  changes.rastra_id,
  rastras.name as rastra_name,
  lines.id as production_line_id,
  lines.name as production_line_name,
  changes.change_type,
  changes.installation_id,
  changes.replaced_installation_id,
  changes.inventory_item_id,
  items.name as inventory_item_name,
  changes.unit_id,
  units.code as unit_code,
  units.name as unit_name,
  changes.quantity,
  changes.actor_profile_id,
  profiles.display_name as actor_display_name,
  changes.responsible_worker_id,
  workers.name as responsible_worker_name,
  changes.occurred_at_utc,
  changes.recorded_at_utc,
  changes.component_identifier,
  changes.installed_condition,
  changes.removed_condition,
  changes.reason,
  changes.installation_notes,
  changes.removal_notes,
  (
    changes.change_type in ('INSTALLATION', 'REPLACEMENT')
    and not exists (
      select 1
      from app.rastra_component_changes as closure
      where closure.organization_id = changes.organization_id
        and closure.rastra_id = changes.rastra_id
        and closure.change_type in ('REMOVAL', 'REPLACEMENT')
        and (
          case when closure.change_type = 'REMOVAL'
            then closure.installation_id
            else closure.replaced_installation_id
          end
        ) = changes.installation_id
    )
  ) as is_active_installation
from app.rastra_component_changes as changes
join app.line_components as rastras
  on rastras.organization_id = changes.organization_id
 and rastras.id = changes.rastra_id
join app.production_lines as lines
  on lines.organization_id = rastras.organization_id
 and lines.id = rastras.production_line_id
join app.user_profiles as profiles
  on profiles.organization_id = changes.organization_id
 and profiles.id = changes.actor_profile_id
left join app.inventory_items as items
  on items.organization_id = changes.organization_id
 and items.plant_id = changes.plant_id
 and items.id = changes.inventory_item_id
left join app.inventory_units as units
  on units.organization_id = changes.organization_id
 and units.id = changes.unit_id
left join app.workers as workers
  on workers.organization_id = changes.organization_id
 and workers.id = changes.responsible_worker_id;

revoke all on table
  app.management_inventory_stock,
  app.management_inventory_review_lines,
  app.management_rastra_component_history
from public, anon, authenticated, service_role;

grant select on table
  app.management_inventory_stock,
  app.management_inventory_review_lines,
  app.management_rastra_component_history
to service_role;

comment on view app.management_inventory_stock is
  'Existencia y última revisión reconstruidas desde hechos de inventario.';
comment on view app.management_inventory_review_lines is
  'Conteos físicos y diferencias para consulta gerencial.';
comment on view app.management_rastra_component_history is
  'Historia completa y estado derivado de instalaciones por rastra.';
