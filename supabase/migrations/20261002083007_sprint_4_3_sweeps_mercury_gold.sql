-- Sprint 4.3: persistencia central de barridas, mercurio por rastra y oro web.
-- El esquema app sigue siendo exclusivo del API; anon/authenticated no acceden
-- directamente y el API autoriza mediante app.profile_has_permission.

alter table app.shipments
  add constraint shipments_sweep_context_unique
  unique (organization_id, id, plant_id, station_id, production_line_id, feed_cycle_id);

alter table app.shipments
  add constraint shipments_mercury_context_unique
  unique (organization_id, id, plant_id, production_line_id);

alter table app.production_events
  add constraint production_events_sweep_context_unique
  unique (organization_id, id, shipment_id, production_line_id, feed_cycle_id);

alter table app.line_components
  add constraint line_components_mercury_context_unique
  unique (organization_id, production_line_id, id);

create table app.production_sweeps (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  station_id uuid not null,
  production_line_id uuid not null,
  feed_cycle_id uuid not null,
  shipment_id uuid not null,
  client_sequence bigint not null,
  cajuela_count integer not null,
  swept_at_utc timestamptz not null,
  recorded_at_utc timestamptz not null,
  recorded_by_profile_id uuid not null,
  is_final boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  constraint production_sweeps_organization_id_id_unique unique (organization_id, id),
  constraint production_sweeps_event_context_unique
    unique (organization_id, id, shipment_id, production_line_id, feed_cycle_id),
  constraint production_sweeps_shipment_context_fk
    foreign key (
      organization_id, shipment_id, plant_id, station_id, production_line_id, feed_cycle_id
    ) references app.shipments (
      organization_id, id, plant_id, station_id, production_line_id, feed_cycle_id
    ) on delete restrict,
  constraint production_sweeps_recorded_by_fk
    foreign key (organization_id, recorded_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint production_sweeps_client_sequence_check check (client_sequence > 0),
  constraint production_sweeps_cajuela_count_check check (cajuela_count > 0),
  constraint production_sweeps_recorded_after_swept_check
    check (recorded_at_utc >= swept_at_utc),
  constraint production_sweeps_notes_check
    check (notes is null or btrim(notes) <> '')
);

create unique index ux_production_sweeps_station_sequence
  on app.production_sweeps (organization_id, station_id, client_sequence);
create unique index ux_production_sweeps_final_per_shipment
  on app.production_sweeps (organization_id, shipment_id)
  where is_final;
create index ix_production_sweeps_shipment_time
  on app.production_sweeps (organization_id, shipment_id, swept_at_utc, id);
create index ix_production_sweeps_line_time
  on app.production_sweeps (organization_id, production_line_id, swept_at_utc, id);
create index ix_production_sweeps_recorded_by
  on app.production_sweeps (organization_id, recorded_by_profile_id);
create index ix_production_sweeps_shipment_context_fk
  on app.production_sweeps (
    organization_id, shipment_id, plant_id, station_id, production_line_id, feed_cycle_id
  );

create table app.sweep_production_events (
  organization_id uuid not null,
  sweep_id uuid not null,
  production_event_id uuid not null,
  shipment_id uuid not null,
  production_line_id uuid not null,
  feed_cycle_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, sweep_id, production_event_id),
  constraint sweep_production_events_event_unique
    unique (organization_id, production_event_id),
  constraint sweep_production_events_sweep_context_fk
    foreign key (
      organization_id, sweep_id, shipment_id, production_line_id, feed_cycle_id
    ) references app.production_sweeps (
      organization_id, id, shipment_id, production_line_id, feed_cycle_id
    ) on delete restrict,
  constraint sweep_production_events_event_context_fk
    foreign key (
      organization_id, production_event_id, shipment_id, production_line_id, feed_cycle_id
    ) references app.production_events (
      organization_id, id, shipment_id, production_line_id, feed_cycle_id
    ) on delete restrict
);

create index ix_sweep_production_events_sweep
  on app.sweep_production_events (organization_id, sweep_id, production_event_id);
create index ix_sweep_production_events_sweep_context_fk
  on app.sweep_production_events (
    organization_id, sweep_id, shipment_id, production_line_id, feed_cycle_id
  );
create index ix_sweep_production_events_event_context_fk
  on app.sweep_production_events (
    organization_id, production_event_id, shipment_id, production_line_id, feed_cycle_id
  );

create function app.validate_production_sweep_count()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  target_organization_id uuid;
  target_sweep_id uuid;
  expected_count integer;
  actual_count integer;
begin
  if tg_table_name = 'production_sweeps' then
    target_organization_id := new.organization_id;
    target_sweep_id := new.id;
  elsif tg_op = 'DELETE' then
    target_organization_id := old.organization_id;
    target_sweep_id := old.sweep_id;
  else
    target_organization_id := new.organization_id;
    target_sweep_id := new.sweep_id;
  end if;

  select sweeps.cajuela_count
    into expected_count
  from app.production_sweeps as sweeps
  where sweeps.organization_id = target_organization_id
    and sweeps.id = target_sweep_id;

  if expected_count is null then
    return null;
  end if;

  select coalesce(sum(events.quantity_delta), 0)::integer
    into actual_count
  from app.sweep_production_events as members
  join app.production_events as events
    on events.organization_id = members.organization_id
   and events.id = members.production_event_id
  where members.organization_id = target_organization_id
    and members.sweep_id = target_sweep_id;

  if actual_count <> expected_count then
    raise exception using
      errcode = '23514',
      message = 'SWEEP_CAJUELA_COUNT_MISMATCH';
  end if;
  return null;
end;
$$;

create constraint trigger trg_production_sweep_count
after insert or update of cajuela_count on app.production_sweeps
deferrable initially deferred
for each row execute function app.validate_production_sweep_count();

create constraint trigger trg_sweep_event_count
after insert or update or delete on app.sweep_production_events
deferrable initially deferred
for each row execute function app.validate_production_sweep_count();

create table app.mercury_movements (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  station_id uuid not null,
  production_line_id uuid not null,
  feed_cycle_id uuid not null,
  shipment_id uuid not null,
  line_component_id uuid not null,
  sweep_id uuid,
  client_sequence bigint not null,
  movement_kind text not null,
  amount_grams numeric,
  unit_code text not null default 'g',
  occurred_at_utc timestamptz not null,
  recorded_at_utc timestamptz not null,
  recorded_by_profile_id uuid not null,
  supersedes_movement_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  constraint mercury_movements_organization_id_id_unique unique (organization_id, id),
  constraint mercury_movements_shipment_context_fk
    foreign key (
      organization_id, shipment_id, plant_id, station_id, production_line_id, feed_cycle_id
    ) references app.shipments (
      organization_id, id, plant_id, station_id, production_line_id, feed_cycle_id
    ) on delete restrict,
  constraint mercury_movements_component_context_fk
    foreign key (organization_id, production_line_id, line_component_id)
    references app.line_components (organization_id, production_line_id, id) on delete restrict,
  constraint mercury_movements_sweep_context_fk
    foreign key (
      organization_id, sweep_id, shipment_id, production_line_id, feed_cycle_id
    ) references app.production_sweeps (
      organization_id, id, shipment_id, production_line_id, feed_cycle_id
    ) on delete restrict,
  constraint mercury_movements_recorded_by_fk
    foreign key (organization_id, recorded_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint mercury_movements_supersedes_fk
    foreign key (organization_id, supersedes_movement_id)
    references app.mercury_movements (organization_id, id) on delete restrict,
  constraint mercury_movements_client_sequence_check check (client_sequence > 0),
  constraint mercury_movements_kind_check
    check (movement_kind in ('INITIAL_LOAD', 'RELOAD', 'RECOVERY')),
  constraint mercury_movements_amount_check
    check (amount_grams is null or (amount_grams >= 0 and scale(amount_grams) <= 2)),
  constraint mercury_movements_unit_check check (unit_code = 'g'),
  constraint mercury_movements_sweep_check check (
    (movement_kind = 'RECOVERY' and sweep_id is not null)
    or (movement_kind in ('INITIAL_LOAD', 'RELOAD') and sweep_id is null)
  ),
  constraint mercury_movements_recorded_after_occurred_check
    check (recorded_at_utc >= occurred_at_utc),
  constraint mercury_movements_notes_check
    check (notes is null or btrim(notes) <> ''),
  constraint mercury_movements_distinct_correction_check
    check (supersedes_movement_id is null or supersedes_movement_id <> id)
);

create unique index ux_mercury_movements_station_sequence
  on app.mercury_movements (organization_id, station_id, client_sequence);
create unique index ux_mercury_movements_superseded_once
  on app.mercury_movements (organization_id, supersedes_movement_id)
  where supersedes_movement_id is not null;
create index ix_mercury_movements_shipment_component_time
  on app.mercury_movements (
    organization_id, shipment_id, line_component_id, occurred_at_utc, id
  );
create index ix_mercury_movements_sweep
  on app.mercury_movements (organization_id, sweep_id)
  where sweep_id is not null;
create index ix_mercury_movements_recorded_by
  on app.mercury_movements (organization_id, recorded_by_profile_id);
create index ix_mercury_movements_shipment_context_fk
  on app.mercury_movements (
    organization_id, shipment_id, plant_id, station_id, production_line_id, feed_cycle_id
  );
create index ix_mercury_movements_component_context_fk
  on app.mercury_movements (organization_id, production_line_id, line_component_id);
create index ix_mercury_movements_sweep_context_fk
  on app.mercury_movements (
    organization_id, sweep_id, shipment_id, production_line_id, feed_cycle_id
  );
create index ix_mercury_movements_supersedes_fk
  on app.mercury_movements (organization_id, supersedes_movement_id);

create function app.validate_mercury_movement()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  component_type_code text;
  previous app.mercury_movements%rowtype;
begin
  select component_types.code
    into component_type_code
  from app.line_components as components
  join app.line_component_types as component_types
    on component_types.id = components.component_type_id
  where components.organization_id = new.organization_id
    and components.production_line_id = new.production_line_id
    and components.id = new.line_component_id;

  if component_type_code <> 'RASTRA' then
    raise exception using errcode = '23514', message = 'MERCURY_COMPONENT_MUST_BE_RASTRA';
  end if;

  if new.supersedes_movement_id is not null then
    select movements.* into previous
    from app.mercury_movements as movements
    where movements.organization_id = new.organization_id
      and movements.id = new.supersedes_movement_id;

    if not found
       or previous.shipment_id <> new.shipment_id
       or previous.production_line_id <> new.production_line_id
       or previous.line_component_id <> new.line_component_id
       or previous.movement_kind <> new.movement_kind
       or previous.sweep_id is distinct from new.sweep_id then
      raise exception using errcode = '23514', message = 'MERCURY_CORRECTION_CONTEXT_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_validate_mercury_movement
before insert on app.mercury_movements
for each row execute function app.validate_mercury_movement();

create table app.gold_result_entries (
  id uuid primary key,
  organization_id uuid not null,
  sweep_id uuid not null,
  amount_grams numeric,
  unit_code text not null default 'g',
  recorded_at_utc timestamptz not null,
  recorded_by_profile_id uuid not null,
  supersedes_result_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  constraint gold_result_entries_organization_id_id_unique unique (organization_id, id),
  constraint gold_result_entries_sweep_fk
    foreign key (organization_id, sweep_id)
    references app.production_sweeps (organization_id, id) on delete restrict,
  constraint gold_result_entries_recorded_by_fk
    foreign key (organization_id, recorded_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint gold_result_entries_supersedes_fk
    foreign key (organization_id, supersedes_result_id)
    references app.gold_result_entries (organization_id, id) on delete restrict,
  constraint gold_result_entries_amount_check
    check (amount_grams is null or (amount_grams >= 0 and scale(amount_grams) <= 2)),
  constraint gold_result_entries_unit_check check (unit_code = 'g'),
  constraint gold_result_entries_notes_check
    check (notes is null or btrim(notes) <> ''),
  constraint gold_result_entries_distinct_correction_check
    check (supersedes_result_id is null or supersedes_result_id <> id)
);

create unique index ux_gold_result_entries_initial_per_sweep
  on app.gold_result_entries (organization_id, sweep_id)
  where supersedes_result_id is null;
create unique index ux_gold_result_entries_superseded_once
  on app.gold_result_entries (organization_id, supersedes_result_id)
  where supersedes_result_id is not null;
create index ix_gold_result_entries_sweep_time
  on app.gold_result_entries (organization_id, sweep_id, recorded_at_utc, id);
create index ix_gold_result_entries_recorded_by
  on app.gold_result_entries (organization_id, recorded_by_profile_id);
create index ix_gold_result_entries_supersedes_fk
  on app.gold_result_entries (organization_id, supersedes_result_id);

create function app.validate_gold_result_correction()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  previous app.gold_result_entries%rowtype;
begin
  if new.supersedes_result_id is not null then
    select entries.* into previous
    from app.gold_result_entries as entries
    where entries.organization_id = new.organization_id
      and entries.id = new.supersedes_result_id;
    if not found or previous.sweep_id <> new.sweep_id then
      raise exception using errcode = '23514', message = 'GOLD_CORRECTION_CONTEXT_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_validate_gold_result_correction
before insert on app.gold_result_entries
for each row execute function app.validate_gold_result_correction();

create table app.gold_deliveries (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  requested_grams numeric not null,
  unit_code text not null default 'g',
  requested_at_utc timestamptz not null,
  requested_by_profile_id uuid not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint gold_deliveries_organization_id_id_unique unique (organization_id, id),
  constraint gold_deliveries_plant_fk
    foreign key (organization_id, plant_id)
    references app.plants (organization_id, id) on delete restrict,
  constraint gold_deliveries_requested_by_fk
    foreign key (organization_id, requested_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint gold_deliveries_amount_check
    check (requested_grams > 0 and scale(requested_grams) <= 2),
  constraint gold_deliveries_unit_check check (unit_code = 'g'),
  constraint gold_deliveries_notes_check check (notes is null or btrim(notes) <> '')
);

create index ix_gold_deliveries_plant_time
  on app.gold_deliveries (organization_id, plant_id, requested_at_utc, id);
create index ix_gold_deliveries_requested_by
  on app.gold_deliveries (organization_id, requested_by_profile_id);

create table app.gold_delivery_decisions (
  id uuid primary key,
  organization_id uuid not null,
  delivery_id uuid not null,
  decision text not null,
  received_grams numeric,
  unit_code text not null default 'g',
  reason text,
  decided_at_utc timestamptz not null,
  decided_by_profile_id uuid not null,
  supersedes_decision_id uuid,
  created_at timestamptz not null default now(),
  constraint gold_delivery_decisions_organization_id_id_unique unique (organization_id, id),
  constraint gold_delivery_decisions_delivery_fk
    foreign key (organization_id, delivery_id)
    references app.gold_deliveries (organization_id, id) on delete restrict,
  constraint gold_delivery_decisions_decided_by_fk
    foreign key (organization_id, decided_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint gold_delivery_decisions_supersedes_fk
    foreign key (organization_id, supersedes_decision_id)
    references app.gold_delivery_decisions (organization_id, id) on delete restrict,
  constraint gold_delivery_decisions_decision_check
    check (decision in ('CONFIRMED', 'REJECTED')),
  constraint gold_delivery_decisions_amount_check check (
    received_grams is null or (received_grams >= 0 and scale(received_grams) <= 2)
  ),
  constraint gold_delivery_decisions_state_check check (
    (decision = 'CONFIRMED' and received_grams is not null)
    or (decision = 'REJECTED' and received_grams is null and btrim(coalesce(reason, '')) <> '')
  ),
  constraint gold_delivery_decisions_unit_check check (unit_code = 'g'),
  constraint gold_delivery_decisions_reason_check
    check (reason is null or btrim(reason) <> ''),
  constraint gold_delivery_decisions_distinct_correction_check
    check (supersedes_decision_id is null or supersedes_decision_id <> id)
);

create unique index ux_gold_delivery_decisions_initial
  on app.gold_delivery_decisions (organization_id, delivery_id)
  where supersedes_decision_id is null;
create unique index ux_gold_delivery_decisions_superseded_once
  on app.gold_delivery_decisions (organization_id, supersedes_decision_id)
  where supersedes_decision_id is not null;
create index ix_gold_delivery_decisions_delivery_time
  on app.gold_delivery_decisions (organization_id, delivery_id, decided_at_utc, id);
create index ix_gold_delivery_decisions_decided_by
  on app.gold_delivery_decisions (organization_id, decided_by_profile_id);
create index ix_gold_delivery_decisions_supersedes_fk
  on app.gold_delivery_decisions (organization_id, supersedes_decision_id);

create function app.validate_gold_delivery_decision()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  requested numeric;
  previous app.gold_delivery_decisions%rowtype;
begin
  select deliveries.requested_grams into requested
  from app.gold_deliveries as deliveries
  where deliveries.organization_id = new.organization_id
    and deliveries.id = new.delivery_id;

  if new.decision = 'CONFIRMED'
     and new.received_grams <> requested
     and btrim(coalesce(new.reason, '')) = '' then
    raise exception using errcode = '23514', message = 'GOLD_DELIVERY_DISCREPANCY_REASON_REQUIRED';
  end if;

  if new.supersedes_decision_id is not null then
    select decisions.* into previous
    from app.gold_delivery_decisions as decisions
    where decisions.organization_id = new.organization_id
      and decisions.id = new.supersedes_decision_id;
    if not found or previous.delivery_id <> new.delivery_id then
      raise exception using errcode = '23514', message = 'GOLD_DELIVERY_CORRECTION_CONTEXT_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_validate_gold_delivery_decision
before insert on app.gold_delivery_decisions
for each row execute function app.validate_gold_delivery_decision();

create function app.reject_sprint_4_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '23514', message = 'SPRINT_4_HISTORY_IS_APPEND_ONLY';
end;
$$;

create trigger trg_production_sweeps_append_only
before update or delete on app.production_sweeps
for each row execute function app.reject_sprint_4_history_mutation();
create trigger trg_sweep_production_events_append_only
before update or delete on app.sweep_production_events
for each row execute function app.reject_sprint_4_history_mutation();
create trigger trg_mercury_movements_append_only
before update or delete on app.mercury_movements
for each row execute function app.reject_sprint_4_history_mutation();
create trigger trg_gold_result_entries_append_only
before update or delete on app.gold_result_entries
for each row execute function app.reject_sprint_4_history_mutation();
create trigger trg_gold_deliveries_append_only
before update or delete on app.gold_deliveries
for each row execute function app.reject_sprint_4_history_mutation();
create trigger trg_gold_delivery_decisions_append_only
before update or delete on app.gold_delivery_decisions
for each row execute function app.reject_sprint_4_history_mutation();

insert into app.permissions (id, code, description)
values
  ('10000000-0000-4000-8000-000000000025', 'gold.read', 'Consultar resultados de oro, custodia y entregas.'),
  ('10000000-0000-4000-8000-000000000026', 'gold.results.manage', 'Registrar o corregir resultados de oro por barrida.'),
  ('10000000-0000-4000-8000-000000000027', 'gold.deliveries.manage', 'Registrar solicitudes de entrega de oro.')
on conflict (id) do update
set code = excluded.code, description = excluded.description, is_active = true;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'production_sweeps',
    'sweep_production_events',
    'mercury_movements',
    'gold_result_entries',
    'gold_deliveries',
    'gold_delivery_decisions'
  ]
  loop
    execute format('alter table app.%I enable row level security', table_name);
    execute format(
      'create policy backend_service_all on app.%I for all to service_role using (true) with check (true)',
      table_name
    );
    execute format('revoke all on table app.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert on table app.%I to service_role', table_name);
  end loop;
end;
$$;

comment on table app.production_sweeps is
  'Barridas físicas inmutables; sus eventos exactos no pueden solaparse ni mezclar cargamentos.';
comment on table app.mercury_movements is
  'Cargas, recargas y recuperaciones de mercurio por rastra; NULL es pendiente y cero es medido.';
comment on table app.gold_result_entries is
  'Resultados de oro exclusivos de web/API; nunca se sincronizan a SQLite desktop.';
comment on table app.gold_deliveries is
  'Solicitudes de entrega usadas para derivar custodia; no modela venta, transporte ni contabilidad.';
