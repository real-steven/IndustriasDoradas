-- Sprint 7.4: persistencia de inventario, componentes y novedades.
-- El esquema app es privado; NestJS accede únicamente mediante service_role.
-- Existencias y estados vigentes son proyecciones de hechos append-only.

create table app.inventory_item_types (
  id uuid primary key,
  organization_id uuid not null,
  code text not null,
  name text not null,
  is_custom boolean not null default false,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_item_types_organization_id_id_unique
    unique (organization_id, id),
  constraint inventory_item_types_organization_fk
    foreign key (organization_id)
    references app.organizations (id) on delete restrict,
  constraint inventory_item_types_code_format_check
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
  constraint inventory_item_types_name_check check (btrim(name) <> ''),
  constraint inventory_item_types_deactivation_check check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  ),
  constraint inventory_item_types_updated_check check (updated_at >= created_at)
);

create unique index ux_inventory_item_types_code
  on app.inventory_item_types (organization_id, lower(code));
create index ix_inventory_item_types_active
  on app.inventory_item_types (organization_id, is_active, name);

create table app.inventory_units (
  id uuid primary key,
  organization_id uuid not null,
  code text not null,
  name text not null,
  decimal_places smallint not null,
  is_custom boolean not null default false,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_units_organization_id_id_unique
    unique (organization_id, id),
  constraint inventory_units_organization_fk
    foreign key (organization_id)
    references app.organizations (id) on delete restrict,
  constraint inventory_units_code_format_check
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
  constraint inventory_units_name_check check (btrim(name) <> ''),
  constraint inventory_units_precision_check check (decimal_places between 0 and 3),
  constraint inventory_units_deactivation_check check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  ),
  constraint inventory_units_updated_check check (updated_at >= created_at)
);

create unique index ux_inventory_units_code
  on app.inventory_units (organization_id, lower(code));
create index ix_inventory_units_active
  on app.inventory_units (organization_id, is_active, name);

create table app.inventory_items (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  item_type_id uuid not null,
  unit_id uuid not null,
  name text not null,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_items_organization_id_id_unique
    unique (organization_id, id),
  constraint inventory_items_organization_plant_id_id_unique
    unique (organization_id, plant_id, id),
  constraint inventory_items_plant_fk
    foreign key (organization_id, plant_id)
    references app.plants (organization_id, id) on delete restrict,
  constraint inventory_items_type_fk
    foreign key (organization_id, item_type_id)
    references app.inventory_item_types (organization_id, id) on delete restrict,
  constraint inventory_items_unit_fk
    foreign key (organization_id, unit_id)
    references app.inventory_units (organization_id, id) on delete restrict,
  constraint inventory_items_name_check check (btrim(name) <> ''),
  constraint inventory_items_deactivation_check check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  ),
  constraint inventory_items_updated_check check (updated_at >= created_at)
);

create unique index ux_inventory_items_name_per_plant
  on app.inventory_items (organization_id, plant_id, lower(btrim(name)));
create index ix_inventory_items_type_active
  on app.inventory_items (organization_id, item_type_id, plant_id, is_active, name);
create index ix_inventory_items_unit_fk
  on app.inventory_items (organization_id, unit_id);

create table app.inventory_movements (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  inventory_item_id uuid not null,
  unit_id uuid not null,
  movement_type text not null,
  quantity_delta numeric(18, 3) not null,
  actor_profile_id uuid not null,
  station_id uuid,
  client_sequence bigint,
  responsible_worker_id uuid,
  occurred_at_utc timestamptz not null,
  recorded_at_utc timestamptz not null,
  reason text,
  destination text,
  notes text,
  related_movement_id uuid,
  created_at timestamptz not null default now(),
  constraint inventory_movements_organization_id_id_unique
    unique (organization_id, id),
  constraint inventory_movements_item_fk
    foreign key (organization_id, plant_id, inventory_item_id)
    references app.inventory_items (organization_id, plant_id, id) on delete restrict,
  constraint inventory_movements_unit_fk
    foreign key (organization_id, unit_id)
    references app.inventory_units (organization_id, id) on delete restrict,
  constraint inventory_movements_actor_fk
    foreign key (organization_id, actor_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint inventory_movements_station_fk
    foreign key (organization_id, plant_id, station_id)
    references app.stations (organization_id, plant_id, id) on delete restrict,
  constraint inventory_movements_worker_fk
    foreign key (organization_id, responsible_worker_id)
    references app.workers (organization_id, id) on delete restrict,
  constraint inventory_movements_related_fk
    foreign key (organization_id, related_movement_id)
    references app.inventory_movements (organization_id, id) on delete restrict,
  constraint inventory_movements_type_check check (
    movement_type in ('ENTRY', 'EXIT', 'CONSUMPTION', 'RETURN', 'ADJUSTMENT', 'REVERSAL')
  ),
  constraint inventory_movements_quantity_check check (quantity_delta <> 0),
  constraint inventory_movements_direction_check check (
    (movement_type in ('ENTRY', 'RETURN') and quantity_delta > 0)
    or (movement_type in ('EXIT', 'CONSUMPTION') and quantity_delta < 0)
    or movement_type in ('ADJUSTMENT', 'REVERSAL')
  ),
  constraint inventory_movements_station_sequence_check check (
    (station_id is null and client_sequence is null)
    or (station_id is not null and client_sequence > 0)
  ),
  constraint inventory_movements_time_check check (recorded_at_utc >= occurred_at_utc),
  constraint inventory_movements_reason_check check (
    movement_type not in ('ADJUSTMENT', 'REVERSAL')
    or btrim(coalesce(reason, '')) <> ''
  ),
  constraint inventory_movements_relation_check check (
    (movement_type = 'REVERSAL' and related_movement_id is not null)
    or (movement_type = 'RETURN')
    or (movement_type not in ('RETURN', 'REVERSAL') and related_movement_id is null)
  ),
  constraint inventory_movements_optional_text_check check (
    (reason is null or btrim(reason) <> '')
    and (destination is null or btrim(destination) <> '')
    and (notes is null or btrim(notes) <> '')
  ),
  constraint inventory_movements_not_self_related_check
    check (related_movement_id is null or related_movement_id <> id)
);

create unique index ux_inventory_movements_station_sequence
  on app.inventory_movements (organization_id, station_id, client_sequence)
  where station_id is not null;
create unique index ux_inventory_movements_reversal_once
  on app.inventory_movements (organization_id, related_movement_id)
  where movement_type = 'REVERSAL';
create index ix_inventory_movements_item_time
  on app.inventory_movements (
    organization_id, plant_id, inventory_item_id, occurred_at_utc, id
  );
create index ix_inventory_movements_related_fk
  on app.inventory_movements (organization_id, related_movement_id);
create index ix_inventory_movements_actor_fk
  on app.inventory_movements (organization_id, actor_profile_id);
create index ix_inventory_movements_station_fk
  on app.inventory_movements (organization_id, plant_id, station_id);
create index ix_inventory_movements_unit_fk
  on app.inventory_movements (organization_id, unit_id);
create index ix_inventory_movements_worker_fk
  on app.inventory_movements (organization_id, responsible_worker_id);

create table app.inventory_reviews (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  status text not null,
  reviewed_by_profile_id uuid not null,
  station_id uuid,
  client_sequence bigint,
  reviewed_at_utc timestamptz not null,
  recorded_at_utc timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint inventory_reviews_organization_id_id_unique
    unique (organization_id, id),
  constraint inventory_reviews_organization_plant_id_id_unique
    unique (organization_id, plant_id, id),
  constraint inventory_reviews_plant_fk
    foreign key (organization_id, plant_id)
    references app.plants (organization_id, id) on delete restrict,
  constraint inventory_reviews_actor_fk
    foreign key (organization_id, reviewed_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint inventory_reviews_station_fk
    foreign key (organization_id, plant_id, station_id)
    references app.stations (organization_id, plant_id, id) on delete restrict,
  constraint inventory_reviews_status_check
    check (status in ('WITHOUT_DIFFERENCES', 'WITH_DIFFERENCES')),
  constraint inventory_reviews_station_sequence_check check (
    (station_id is null and client_sequence is null)
    or (station_id is not null and client_sequence > 0)
  ),
  constraint inventory_reviews_time_check check (recorded_at_utc >= reviewed_at_utc),
  constraint inventory_reviews_notes_check check (notes is null or btrim(notes) <> '')
);

create unique index ux_inventory_reviews_station_sequence
  on app.inventory_reviews (organization_id, station_id, client_sequence)
  where station_id is not null;
create index ix_inventory_reviews_plant_time
  on app.inventory_reviews (organization_id, plant_id, reviewed_at_utc desc, id);
create index ix_inventory_reviews_actor_fk
  on app.inventory_reviews (organization_id, reviewed_by_profile_id);
create index ix_inventory_reviews_station_fk
  on app.inventory_reviews (organization_id, plant_id, station_id);

create table app.inventory_review_lines (
  organization_id uuid not null,
  plant_id uuid not null,
  review_id uuid not null,
  inventory_item_id uuid not null,
  unit_id uuid not null,
  expected_quantity numeric(18, 3) not null,
  counted_quantity numeric(18, 3) not null,
  difference_quantity numeric(18, 3) not null,
  created_at timestamptz not null default now(),
  constraint inventory_review_lines_pk
    primary key (organization_id, review_id, inventory_item_id),
  constraint inventory_review_lines_review_fk
    foreign key (organization_id, plant_id, review_id)
    references app.inventory_reviews (organization_id, plant_id, id) on delete restrict,
  constraint inventory_review_lines_item_fk
    foreign key (organization_id, plant_id, inventory_item_id)
    references app.inventory_items (organization_id, plant_id, id) on delete restrict,
  constraint inventory_review_lines_unit_fk
    foreign key (organization_id, unit_id)
    references app.inventory_units (organization_id, id) on delete restrict,
  constraint inventory_review_lines_quantity_check check (
    expected_quantity >= 0 and counted_quantity >= 0
  ),
  constraint inventory_review_lines_difference_check
    check (difference_quantity = counted_quantity - expected_quantity)
);

create index ix_inventory_review_lines_item
  on app.inventory_review_lines (
    organization_id, plant_id, inventory_item_id, review_id
  );
create index ix_inventory_review_lines_unit_fk
  on app.inventory_review_lines (organization_id, unit_id);
create index ix_inventory_review_lines_review_fk
  on app.inventory_review_lines (organization_id, plant_id, review_id);

create table app.rastra_component_changes (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  rastra_id uuid not null,
  change_type text not null,
  installation_id uuid not null,
  replaced_installation_id uuid,
  inventory_item_id uuid,
  unit_id uuid,
  quantity numeric(18, 3),
  actor_profile_id uuid not null,
  station_id uuid,
  client_sequence bigint,
  responsible_worker_id uuid,
  occurred_at_utc timestamptz not null,
  recorded_at_utc timestamptz not null,
  component_identifier text,
  installed_condition text,
  removed_condition text,
  reason text,
  installation_notes text,
  removal_notes text,
  created_at timestamptz not null default now(),
  constraint rastra_component_changes_organization_id_id_unique
    unique (organization_id, id),
  constraint rastra_component_changes_rastra_fk
    foreign key (organization_id, rastra_id)
    references app.line_components (organization_id, id) on delete restrict,
  constraint rastra_component_changes_item_fk
    foreign key (organization_id, plant_id, inventory_item_id)
    references app.inventory_items (organization_id, plant_id, id) on delete restrict,
  constraint rastra_component_changes_unit_fk
    foreign key (organization_id, unit_id)
    references app.inventory_units (organization_id, id) on delete restrict,
  constraint rastra_component_changes_actor_fk
    foreign key (organization_id, actor_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint rastra_component_changes_station_fk
    foreign key (organization_id, plant_id, station_id)
    references app.stations (organization_id, plant_id, id) on delete restrict,
  constraint rastra_component_changes_worker_fk
    foreign key (organization_id, responsible_worker_id)
    references app.workers (organization_id, id) on delete restrict,
  constraint rastra_component_changes_type_check
    check (change_type in ('INSTALLATION', 'REMOVAL', 'REPLACEMENT')),
  constraint rastra_component_changes_station_sequence_check check (
    (station_id is null and client_sequence is null)
    or (station_id is not null and client_sequence > 0)
  ),
  constraint rastra_component_changes_time_check
    check (recorded_at_utc >= occurred_at_utc),
  constraint rastra_component_changes_shape_check check (
    (
      change_type = 'INSTALLATION'
      and replaced_installation_id is null
      and inventory_item_id is not null and unit_id is not null and quantity > 0
      and btrim(coalesce(installed_condition, '')) <> ''
      and removed_condition is null and reason is null
    ) or (
      change_type = 'REMOVAL'
      and replaced_installation_id is null
      and inventory_item_id is null and unit_id is null and quantity is null
      and installed_condition is null
      and btrim(coalesce(removed_condition, '')) <> ''
      and btrim(coalesce(reason, '')) <> ''
    ) or (
      change_type = 'REPLACEMENT'
      and replaced_installation_id is not null
      and replaced_installation_id <> installation_id
      and inventory_item_id is not null and unit_id is not null and quantity > 0
      and btrim(coalesce(installed_condition, '')) <> ''
      and btrim(coalesce(removed_condition, '')) <> ''
      and btrim(coalesce(reason, '')) <> ''
    )
  ),
  constraint rastra_component_changes_optional_text_check check (
    (component_identifier is null or btrim(component_identifier) <> '')
    and (installation_notes is null or btrim(installation_notes) <> '')
    and (removal_notes is null or btrim(removal_notes) <> '')
  )
);

create unique index ux_rastra_component_changes_station_sequence
  on app.rastra_component_changes (organization_id, station_id, client_sequence)
  where station_id is not null;
create unique index ux_rastra_component_installation_once
  on app.rastra_component_changes (organization_id, installation_id)
  where change_type in ('INSTALLATION', 'REPLACEMENT');
create unique index ux_rastra_component_closure_once
  on app.rastra_component_changes (
    organization_id,
    (case when change_type = 'REMOVAL'
      then installation_id else replaced_installation_id end)
  ) where change_type in ('REMOVAL', 'REPLACEMENT');
create index ix_rastra_component_changes_timeline
  on app.rastra_component_changes (
    organization_id, plant_id, rastra_id, occurred_at_utc, id
  );
create index ix_rastra_component_changes_item_fk
  on app.rastra_component_changes (organization_id, plant_id, inventory_item_id);
create index ix_rastra_component_changes_actor_fk
  on app.rastra_component_changes (organization_id, actor_profile_id);
create index ix_rastra_component_changes_rastra_fk
  on app.rastra_component_changes (organization_id, rastra_id);
create index ix_rastra_component_changes_station_fk
  on app.rastra_component_changes (organization_id, plant_id, station_id);
create index ix_rastra_component_changes_unit_fk
  on app.rastra_component_changes (organization_id, unit_id);
create index ix_rastra_component_changes_worker_fk
  on app.rastra_component_changes (organization_id, responsible_worker_id);

create table app.operational_novelty_categories (
  id uuid primary key,
  organization_id uuid not null,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_novelty_categories_organization_id_id_unique
    unique (organization_id, id),
  constraint operational_novelty_categories_organization_fk
    foreign key (organization_id)
    references app.organizations (id) on delete restrict,
  constraint operational_novelty_categories_code_format_check
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
  constraint operational_novelty_categories_name_check check (btrim(name) <> ''),
  constraint operational_novelty_categories_deactivation_check check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  ),
  constraint operational_novelty_categories_updated_check check (updated_at >= created_at)
);

create unique index ux_operational_novelty_categories_code
  on app.operational_novelty_categories (organization_id, lower(code));

create table app.operational_novelty_changes (
  id uuid primary key,
  novelty_id uuid not null,
  organization_id uuid not null,
  plant_id uuid not null,
  change_type text not null,
  line_id uuid,
  category_id uuid,
  description text,
  actor_profile_id uuid not null,
  station_id uuid,
  client_sequence bigint,
  responsible_worker_id uuid,
  occurred_at_utc timestamptz not null,
  recorded_at_utc timestamptz not null,
  created_at timestamptz not null default now(),
  constraint operational_novelty_changes_organization_id_id_unique
    unique (organization_id, id),
  constraint operational_novelty_changes_plant_fk
    foreign key (organization_id, plant_id)
    references app.plants (organization_id, id) on delete restrict,
  constraint operational_novelty_changes_line_fk
    foreign key (organization_id, plant_id, line_id)
    references app.production_lines (organization_id, plant_id, id) on delete restrict,
  constraint operational_novelty_changes_category_fk
    foreign key (organization_id, category_id)
    references app.operational_novelty_categories (organization_id, id) on delete restrict,
  constraint operational_novelty_changes_actor_fk
    foreign key (organization_id, actor_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint operational_novelty_changes_station_fk
    foreign key (organization_id, plant_id, station_id)
    references app.stations (organization_id, plant_id, id) on delete restrict,
  constraint operational_novelty_changes_worker_fk
    foreign key (organization_id, responsible_worker_id)
    references app.workers (organization_id, id) on delete restrict,
  constraint operational_novelty_changes_type_check
    check (change_type in ('OPENING', 'CLOSURE')),
  constraint operational_novelty_changes_station_sequence_check check (
    (station_id is null and client_sequence is null)
    or (station_id is not null and client_sequence > 0)
  ),
  constraint operational_novelty_changes_time_check
    check (recorded_at_utc >= occurred_at_utc),
  constraint operational_novelty_changes_shape_check check (
    (
      change_type = 'OPENING'
      and btrim(coalesce(description, '')) <> ''
    ) or (
      change_type = 'CLOSURE'
      and line_id is null and category_id is null and description is null
    )
  )
);

create unique index ux_operational_novelty_opening_once
  on app.operational_novelty_changes (organization_id, novelty_id)
  where change_type = 'OPENING';
create unique index ux_operational_novelty_closure_once
  on app.operational_novelty_changes (organization_id, novelty_id)
  where change_type = 'CLOSURE';
create unique index ux_operational_novelty_station_sequence
  on app.operational_novelty_changes (organization_id, station_id, client_sequence)
  where station_id is not null;
create index ix_operational_novelty_plant_time
  on app.operational_novelty_changes (
    organization_id, plant_id, occurred_at_utc desc, novelty_id
  );
create index ix_operational_novelty_line_time
  on app.operational_novelty_changes (
    organization_id, plant_id, line_id, occurred_at_utc desc, novelty_id
  );
create index ix_operational_novelty_category_fk
  on app.operational_novelty_changes (organization_id, category_id);
create index ix_operational_novelty_actor_fk
  on app.operational_novelty_changes (organization_id, actor_profile_id);
create index ix_operational_novelty_station_fk
  on app.operational_novelty_changes (organization_id, plant_id, station_id);
create index ix_operational_novelty_worker_fk
  on app.operational_novelty_changes (organization_id, responsible_worker_id);

create trigger trg_inventory_item_types_updated_at
before update on app.inventory_item_types
for each row execute function app.set_updated_at();
create trigger trg_inventory_units_updated_at
before update on app.inventory_units
for each row execute function app.set_updated_at();
create trigger trg_inventory_items_updated_at
before update on app.inventory_items
for each row execute function app.set_updated_at();
create trigger trg_operational_novelty_categories_updated_at
before update on app.operational_novelty_categories
for each row execute function app.set_updated_at();

create function app.reject_inventory_history_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'INVENTORY_HISTORY_IS_APPEND_ONLY';
end;
$$;

revoke all on function app.reject_inventory_history_mutation_v1()
  from public, anon, authenticated;
grant execute on function app.reject_inventory_history_mutation_v1()
  to service_role;

create trigger trg_inventory_movements_append_only
before update or delete on app.inventory_movements
for each row execute function app.reject_inventory_history_mutation_v1();
create trigger trg_inventory_reviews_append_only
before update or delete on app.inventory_reviews
for each row execute function app.reject_inventory_history_mutation_v1();
create trigger trg_inventory_review_lines_append_only
before update or delete on app.inventory_review_lines
for each row execute function app.reject_inventory_history_mutation_v1();
create trigger trg_rastra_component_changes_append_only
before update or delete on app.rastra_component_changes
for each row execute function app.reject_inventory_history_mutation_v1();
create trigger trg_operational_novelty_changes_append_only
before update or delete on app.operational_novelty_changes
for each row execute function app.reject_inventory_history_mutation_v1();

create function app.validate_inventory_movement_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  item app.inventory_items%rowtype;
  unit app.inventory_units%rowtype;
  related app.inventory_movements%rowtype;
  current_balance numeric(18, 3);
  returned_quantity numeric(18, 3);
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.organization_id::text || ':inventory:' || new.inventory_item_id::text,
    0
  ));

  select candidate.* into item
  from app.inventory_items as candidate
  where candidate.organization_id = new.organization_id
    and candidate.plant_id = new.plant_id
    and candidate.id = new.inventory_item_id;
  if not found or item.unit_id <> new.unit_id then
    raise exception using errcode = '23514', message = 'INVENTORY_ITEM_UNIT_MISMATCH';
  end if;
  if not item.is_active then
    raise exception using errcode = '23514', message = 'INVENTORY_ITEM_INACTIVE';
  end if;

  select candidate.* into unit
  from app.inventory_units as candidate
  where candidate.organization_id = new.organization_id
    and candidate.id = new.unit_id;
  if not found or not unit.is_active
     or new.quantity_delta <> round(new.quantity_delta, unit.decimal_places) then
    raise exception using errcode = '23514', message = 'INVENTORY_UNIT_PRECISION_MISMATCH';
  end if;

  if new.responsible_worker_id is not null and not exists (
    select 1 from app.workers as worker
    where worker.organization_id = new.organization_id
      and worker.plant_id = new.plant_id
      and worker.id = new.responsible_worker_id
  ) then
    raise exception using errcode = '23514', message = 'INVENTORY_WORKER_PLANT_MISMATCH';
  end if;

  select coalesce(sum(movement.quantity_delta), 0) into current_balance
  from app.inventory_movements as movement
  where movement.organization_id = new.organization_id
    and movement.plant_id = new.plant_id
    and movement.inventory_item_id = new.inventory_item_id;
  if current_balance + new.quantity_delta < 0 then
    raise exception using errcode = '23514', message = 'INVENTORY_STOCK_INSUFFICIENT';
  end if;
  if new.related_movement_id is null then
    return new;
  end if;

  select movement.* into related
  from app.inventory_movements as movement
  where movement.organization_id = new.organization_id
    and movement.id = new.related_movement_id;
  if not found
     or related.plant_id <> new.plant_id
     or related.inventory_item_id <> new.inventory_item_id
     or related.unit_id <> new.unit_id then
    raise exception using errcode = '23514', message = 'INVENTORY_RELATED_CONTEXT_MISMATCH';
  end if;

  if new.movement_type = 'RETURN' then
    if related.movement_type <> 'EXIT' then
      raise exception using errcode = '23514', message = 'INVENTORY_RETURN_REQUIRES_EXIT';
    end if;
    select coalesce(sum(movement.quantity_delta), 0) into returned_quantity
    from app.inventory_movements as movement
    where movement.organization_id = new.organization_id
      and movement.movement_type = 'RETURN'
      and movement.related_movement_id = related.id;
    if returned_quantity + new.quantity_delta > abs(related.quantity_delta) then
      raise exception using errcode = '23514', message = 'INVENTORY_RETURN_EXCEEDS_EXIT';
    end if;
  end if;

  if new.movement_type = 'REVERSAL' then
    if new.quantity_delta <> -related.quantity_delta then
      raise exception using errcode = '23514', message = 'INVENTORY_REVERSAL_DELTA_MISMATCH';
    end if;
    if related.movement_type = 'REVERSAL' then
      raise exception using errcode = '23514', message = 'INVENTORY_REVERSAL_OF_REVERSAL';
    end if;
    if related.movement_type = 'EXIT' and exists (
      select 1 from app.inventory_movements as movement
      where movement.organization_id = new.organization_id
        and movement.movement_type = 'RETURN'
        and movement.related_movement_id = related.id
    ) then
      raise exception using errcode = '23514', message = 'INVENTORY_EXIT_WITH_RETURN_CANNOT_REVERSE';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.validate_inventory_movement_v1()
  from public, anon, authenticated;
grant execute on function app.validate_inventory_movement_v1()
  to service_role;

create trigger trg_validate_inventory_movement
before insert on app.inventory_movements
for each row execute function app.validate_inventory_movement_v1();

create function app.validate_inventory_review_line_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  item app.inventory_items%rowtype;
  unit app.inventory_units%rowtype;
  review_status text;
begin
  select candidate.* into item
  from app.inventory_items as candidate
  where candidate.organization_id = new.organization_id
    and candidate.plant_id = new.plant_id
    and candidate.id = new.inventory_item_id;
  select candidate.* into unit
  from app.inventory_units as candidate
  where candidate.organization_id = new.organization_id
    and candidate.id = new.unit_id;
  if item.id is null or unit.id is null or item.unit_id <> new.unit_id then
    raise exception using errcode = '23514', message = 'INVENTORY_REVIEW_UNIT_MISMATCH';
  end if;
  if new.expected_quantity <> round(new.expected_quantity, unit.decimal_places)
     or new.counted_quantity <> round(new.counted_quantity, unit.decimal_places) then
    raise exception using errcode = '23514', message = 'INVENTORY_REVIEW_PRECISION_MISMATCH';
  end if;

  select review.status into review_status
  from app.inventory_reviews as review
  where review.organization_id = new.organization_id
    and review.plant_id = new.plant_id
    and review.id = new.review_id;
  if review_status = 'WITHOUT_DIFFERENCES' and new.difference_quantity <> 0 then
    raise exception using errcode = '23514', message = 'INVENTORY_REVIEW_STATUS_MISMATCH';
  end if;
  return new;
end;
$$;

revoke all on function app.validate_inventory_review_line_v1()
  from public, anon, authenticated;
grant execute on function app.validate_inventory_review_line_v1()
  to service_role;

create trigger trg_validate_inventory_review_line
before insert on app.inventory_review_lines
for each row execute function app.validate_inventory_review_line_v1();

create function app.validate_rastra_component_change_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  item app.inventory_items%rowtype;
  unit app.inventory_units%rowtype;
  previous_installation_id uuid;
  previous_installed_at timestamptz;
begin
  if not exists (
    select 1
    from app.line_components as component
    join app.line_component_types as component_type
      on component_type.id = component.component_type_id
    join app.production_lines as line
      on line.organization_id = component.organization_id
      and line.id = component.production_line_id
    where component.organization_id = new.organization_id
      and component.id = new.rastra_id
      and line.plant_id = new.plant_id
      and component_type.code = 'RASTRA'
  ) then
    raise exception using errcode = '23514', message = 'INVENTORY_COMPONENT_REQUIRES_RASTRA';
  end if;

  if new.change_type in ('INSTALLATION', 'REPLACEMENT') then
    select candidate.* into item
    from app.inventory_items as candidate
    where candidate.organization_id = new.organization_id
      and candidate.plant_id = new.plant_id
      and candidate.id = new.inventory_item_id;
    select candidate.* into unit
    from app.inventory_units as candidate
    where candidate.organization_id = new.organization_id
      and candidate.id = new.unit_id;
    if item.id is null or unit.id is null or item.unit_id <> new.unit_id
       or not item.is_active or not unit.is_active then
      raise exception using errcode = '23514', message = 'INVENTORY_COMPONENT_ITEM_MISMATCH';
    end if;
    if new.quantity <> round(new.quantity, unit.decimal_places) then
      raise exception using errcode = '23514', message = 'INVENTORY_COMPONENT_PRECISION_MISMATCH';
    end if;
  end if;

  if new.responsible_worker_id is not null and not exists (
    select 1 from app.workers as worker
    where worker.organization_id = new.organization_id
      and worker.plant_id = new.plant_id
      and worker.id = new.responsible_worker_id
  ) then
    raise exception using errcode = '23514', message = 'INVENTORY_COMPONENT_WORKER_MISMATCH';
  end if;
  if new.change_type in ('REMOVAL', 'REPLACEMENT') then
    previous_installation_id := case
      when new.change_type = 'REMOVAL' then new.installation_id
      else new.replaced_installation_id
    end;
    select change.occurred_at_utc into previous_installed_at
    from app.rastra_component_changes as change
    where change.organization_id = new.organization_id
      and change.plant_id = new.plant_id
      and change.rastra_id = new.rastra_id
      and change.installation_id = previous_installation_id
      and change.change_type in ('INSTALLATION', 'REPLACEMENT');
    if not found then
      raise exception using errcode = '23514', message = 'INVENTORY_COMPONENT_INSTALLATION_NOT_FOUND';
    end if;
    if new.occurred_at_utc < previous_installed_at then
      raise exception using errcode = '23514', message = 'INVENTORY_COMPONENT_TIME_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.validate_rastra_component_change_v1()
  from public, anon, authenticated;
grant execute on function app.validate_rastra_component_change_v1()
  to service_role;

create trigger trg_validate_rastra_component_change
before insert on app.rastra_component_changes
for each row execute function app.validate_rastra_component_change_v1();

create function app.validate_operational_novelty_change_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  opening app.operational_novelty_changes%rowtype;
begin
  if new.responsible_worker_id is not null and not exists (
    select 1 from app.workers as worker
    where worker.organization_id = new.organization_id
      and worker.plant_id = new.plant_id
      and worker.id = new.responsible_worker_id
  ) then
    raise exception using errcode = '23514', message = 'OPERATIONAL_NOVELTY_WORKER_MISMATCH';
  end if;

  if new.change_type = 'OPENING' then
    if new.category_id is not null and not exists (
      select 1 from app.operational_novelty_categories as category
      where category.organization_id = new.organization_id
        and category.id = new.category_id
        and category.is_active
    ) then
      raise exception using errcode = '23514', message = 'OPERATIONAL_NOVELTY_CATEGORY_INACTIVE';
    end if;
    return new;
  end if;

  select change.* into opening
  from app.operational_novelty_changes as change
  where change.organization_id = new.organization_id
    and change.novelty_id = new.novelty_id
    and change.change_type = 'OPENING';
  if not found or opening.plant_id <> new.plant_id then
    raise exception using errcode = '23514', message = 'OPERATIONAL_NOVELTY_OPENING_NOT_FOUND';
  end if;
  if new.occurred_at_utc < opening.occurred_at_utc then
    raise exception using errcode = '23514', message = 'OPERATIONAL_NOVELTY_TIME_MISMATCH';
  end if;
  return new;
end;
$$;

revoke all on function app.validate_operational_novelty_change_v1()
  from public, anon, authenticated;
grant execute on function app.validate_operational_novelty_change_v1()
  to service_role;

create trigger trg_validate_operational_novelty_change
before insert on app.operational_novelty_changes
for each row execute function app.validate_operational_novelty_change_v1();

alter table app.inventory_item_types enable row level security;
alter table app.inventory_units enable row level security;
alter table app.inventory_items enable row level security;
alter table app.inventory_movements enable row level security;
alter table app.inventory_reviews enable row level security;
alter table app.inventory_review_lines enable row level security;
alter table app.rastra_component_changes enable row level security;
alter table app.operational_novelty_categories enable row level security;
alter table app.operational_novelty_changes enable row level security;

create policy backend_service_all on app.inventory_item_types
  for all to service_role using (true) with check (true);
create policy backend_service_all on app.inventory_units
  for all to service_role using (true) with check (true);
create policy backend_service_all on app.inventory_items
  for all to service_role using (true) with check (true);
create policy backend_service_all on app.inventory_movements
  for all to service_role using (true) with check (true);
create policy backend_service_all on app.inventory_reviews
  for all to service_role using (true) with check (true);
create policy backend_service_all on app.inventory_review_lines
  for all to service_role using (true) with check (true);
create policy backend_service_all on app.rastra_component_changes
  for all to service_role using (true) with check (true);
create policy backend_service_all on app.operational_novelty_categories
  for all to service_role using (true) with check (true);
create policy backend_service_all on app.operational_novelty_changes
  for all to service_role using (true) with check (true);

revoke all on table app.inventory_item_types from public, anon, authenticated, service_role;
revoke all on table app.inventory_units from public, anon, authenticated, service_role;
revoke all on table app.inventory_items from public, anon, authenticated, service_role;
revoke all on table app.inventory_movements from public, anon, authenticated, service_role;
revoke all on table app.inventory_reviews from public, anon, authenticated, service_role;
revoke all on table app.inventory_review_lines from public, anon, authenticated, service_role;
revoke all on table app.rastra_component_changes from public, anon, authenticated, service_role;
revoke all on table app.operational_novelty_categories from public, anon, authenticated, service_role;
revoke all on table app.operational_novelty_changes from public, anon, authenticated, service_role;

grant select, insert, update on table
  app.inventory_item_types,
  app.inventory_units,
  app.inventory_items,
  app.operational_novelty_categories
to service_role;

grant select, insert on table
  app.inventory_movements,
  app.inventory_reviews,
  app.inventory_review_lines,
  app.rastra_component_changes,
  app.operational_novelty_changes
to service_role;

comment on table app.inventory_movements is
  'Kardex append-only; la existencia es la suma de quantity_delta y no una columna editable.';
comment on table app.inventory_reviews is
  'Cabecera inmutable de conteo físico; no modifica existencias automáticamente.';
comment on table app.inventory_review_lines is
  'Cantidades esperada, contada y diferencia auditadas por artículo y revisión.';
comment on table app.rastra_component_changes is
  'Instalaciones, retiros y reemplazos append-only de componentes de rastra.';
comment on table app.operational_novelty_changes is
  'Aperturas y cierres auditables de novedades de planta o línea; no son órdenes CMMS.';
