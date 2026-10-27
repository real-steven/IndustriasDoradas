-- Sprint 7.9: frontera explicita e inmutable entre kardex, barridas y herramientas asignadas.
-- El enlace no contiene cantidad: nunca convierte mediciones de mercurio en
-- movimientos ni aplica un segundo efecto sobre el saldo.

create table app.inventory_sweep_links (
  organization_id uuid not null,
  plant_id uuid not null,
  inventory_movement_id uuid not null,
  sweep_id uuid not null,
  linked_by_profile_id uuid not null,
  linked_at_utc timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, inventory_movement_id),
  constraint inventory_sweep_links_movement_fk
    foreign key (organization_id, inventory_movement_id)
    references app.inventory_movements (organization_id, id) on delete restrict,
  constraint inventory_sweep_links_sweep_fk
    foreign key (organization_id, sweep_id)
    references app.production_sweeps (organization_id, id) on delete restrict,
  constraint inventory_sweep_links_actor_fk
    foreign key (organization_id, linked_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict
);

create index ix_inventory_sweep_links_sweep
  on app.inventory_sweep_links (organization_id, sweep_id, plant_id);
create index ix_inventory_sweep_links_actor
  on app.inventory_sweep_links (organization_id, linked_by_profile_id);

create function app.validate_inventory_sweep_link_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  movement app.inventory_movements%rowtype;
  sweep app.production_sweeps%rowtype;
  original_sweep_id uuid;
begin
  select value.* into movement
  from app.inventory_movements as value
  where value.organization_id = new.organization_id
    and value.id = new.inventory_movement_id;
  select value.* into sweep
  from app.production_sweeps as value
  where value.organization_id = new.organization_id
    and value.id = new.sweep_id;

  if movement.id is null or sweep.id is null
     or movement.plant_id <> new.plant_id
     or sweep.plant_id <> new.plant_id then
    raise exception using errcode = '23514', message = 'INVENTORY_SWEEP_CONTEXT_MISMATCH';
  end if;

  if movement.movement_type = 'REVERSAL' then
    select link.sweep_id into original_sweep_id
    from app.inventory_sweep_links as link
    where link.organization_id = new.organization_id
      and link.inventory_movement_id = movement.related_movement_id;
    if original_sweep_id is distinct from new.sweep_id then
      raise exception using errcode = '23514', message = 'INVENTORY_REVERSAL_SWEEP_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.validate_inventory_sweep_link_v1()
  from public, anon, authenticated;

create trigger trg_validate_inventory_sweep_link
before insert on app.inventory_sweep_links
for each row execute function app.validate_inventory_sweep_link_v1();

create trigger trg_inventory_sweep_links_append_only
before update or delete on app.inventory_sweep_links
for each row execute function app.reject_inventory_history_mutation_v1();

create function app.validate_inventory_reversal_sweep_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  original_sweep_id uuid;
  reversal_sweep_id uuid;
begin
  if new.movement_type <> 'REVERSAL' then return null; end if;
  select link.sweep_id into original_sweep_id
  from app.inventory_sweep_links as link
  where link.organization_id = new.organization_id
    and link.inventory_movement_id = new.related_movement_id;
  select link.sweep_id into reversal_sweep_id
  from app.inventory_sweep_links as link
  where link.organization_id = new.organization_id
    and link.inventory_movement_id = new.id;
  if original_sweep_id is distinct from reversal_sweep_id then
    raise exception using errcode = '23514', message = 'INVENTORY_REVERSAL_SWEEP_MISMATCH';
  end if;
  return null;
end;
$$;

revoke all on function app.validate_inventory_reversal_sweep_v1()
  from public, anon, authenticated;

create constraint trigger trg_validate_inventory_reversal_sweep
after insert on app.inventory_movements
deferrable initially deferred
for each row execute function app.validate_inventory_reversal_sweep_v1();

create view app.management_inventory_movements
with (security_invoker = true) as
select
  movement.*,
  link.sweep_id as linked_sweep_id
from app.inventory_movements as movement
left join app.inventory_sweep_links as link
  on link.organization_id = movement.organization_id
 and link.inventory_movement_id = movement.id;

create view app.management_inventory_assignments
with (security_invoker = true) as
select
  exit_movement.organization_id,
  exit_movement.plant_id,
  exit_movement.id as exit_movement_id,
  exit_movement.inventory_item_id,
  item.name as inventory_item_name,
  item.item_type_id,
  item_type.name as item_type_name,
  exit_movement.unit_id,
  unit.code as unit_code,
  unit.name as unit_name,
  exit_movement.responsible_worker_id,
  worker.name as responsible_worker_name,
  exit_movement.occurred_at_utc as assigned_at_utc,
  abs(exit_movement.quantity_delta) as assigned_quantity,
  coalesce(returned.returned_quantity, 0) as returned_quantity,
  case when reversal.id is not null then 0
    else greatest(abs(exit_movement.quantity_delta)
      - coalesce(returned.returned_quantity, 0), 0) end as pending_quantity,
  case when reversal.id is not null
      or coalesce(returned.returned_quantity, 0) >= abs(exit_movement.quantity_delta)
    then 'RETURNED' else 'ASSIGNED' end as assignment_status,
  link.sweep_id as linked_sweep_id,
  exit_movement.destination,
  exit_movement.notes
from app.inventory_movements as exit_movement
join app.inventory_items as item
  on item.organization_id = exit_movement.organization_id
 and item.id = exit_movement.inventory_item_id
join app.inventory_item_types as item_type
  on item_type.organization_id = item.organization_id
 and item_type.id = item.item_type_id
join app.inventory_units as unit
  on unit.organization_id = exit_movement.organization_id
 and unit.id = exit_movement.unit_id
join app.workers as worker
  on worker.organization_id = exit_movement.organization_id
 and worker.id = exit_movement.responsible_worker_id
left join lateral (
  select coalesce(sum(value.quantity_delta), 0) as returned_quantity
  from app.inventory_movements as value
  where value.organization_id = exit_movement.organization_id
    and value.movement_type = 'RETURN'
    and value.related_movement_id = exit_movement.id
    and not exists (
      select 1 from app.inventory_movements as correction
      where correction.organization_id = value.organization_id
        and correction.movement_type = 'REVERSAL'
        and correction.related_movement_id = value.id
    )
) as returned on true
left join app.inventory_movements as reversal
  on reversal.organization_id = exit_movement.organization_id
 and reversal.movement_type = 'REVERSAL'
 and reversal.related_movement_id = exit_movement.id
left join app.inventory_sweep_links as link
  on link.organization_id = exit_movement.organization_id
 and link.inventory_movement_id = exit_movement.id
where exit_movement.movement_type = 'EXIT'
  and exit_movement.responsible_worker_id is not null
  and item_type.code = 'HERRAMIENTA';

create function app.record_inventory_movement_v2(
  target_movement_id uuid,
  target_organization_id uuid,
  target_plant_id uuid,
  target_inventory_item_id uuid,
  target_unit_id uuid,
  target_movement_type text,
  target_quantity_delta numeric,
  target_actor_profile_id uuid,
  target_responsible_worker_id uuid,
  target_occurred_at_utc timestamptz,
  target_recorded_at_utc timestamptz,
  target_reason text,
  target_destination text,
  target_notes text,
  target_related_movement_id uuid,
  target_linked_sweep_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  movement app.inventory_movements%rowtype;
begin
  insert into app.inventory_movements (
    id, organization_id, plant_id, inventory_item_id, unit_id,
    movement_type, quantity_delta, actor_profile_id, responsible_worker_id,
    occurred_at_utc, recorded_at_utc, reason, destination, notes,
    related_movement_id
  ) values (
    target_movement_id, target_organization_id, target_plant_id,
    target_inventory_item_id, target_unit_id, target_movement_type,
    target_quantity_delta, target_actor_profile_id, target_responsible_worker_id,
    target_occurred_at_utc, target_recorded_at_utc, target_reason,
    target_destination, target_notes, target_related_movement_id
  ) returning * into movement;

  if target_linked_sweep_id is not null then
    insert into app.inventory_sweep_links (
      organization_id, plant_id, inventory_movement_id, sweep_id,
      linked_by_profile_id, linked_at_utc
    ) values (
      target_organization_id, target_plant_id, target_movement_id,
      target_linked_sweep_id, target_actor_profile_id, target_recorded_at_utc
    );
  end if;

  return to_jsonb(movement)
    || jsonb_build_object('linked_sweep_id', target_linked_sweep_id);
end;
$$;

revoke all on function app.record_inventory_movement_v2(
  uuid, uuid, uuid, uuid, uuid, text, numeric, uuid, uuid,
  timestamptz, timestamptz, text, text, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function app.record_inventory_movement_v2(
  uuid, uuid, uuid, uuid, uuid, text, numeric, uuid, uuid,
  timestamptz, timestamptz, text, text, text, uuid, uuid
) to service_role;

create function app.capture_inventory_sweep_link_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  sequence_value bigint := nextval('app.sync_changes_server_sequence_seq');
  payload_value jsonb;
begin
  select to_jsonb(movement) || jsonb_build_object('linked_sweep_id', new.sweep_id)
    into payload_value
  from app.inventory_movements as movement
  where movement.organization_id = new.organization_id
    and movement.id = new.inventory_movement_id;

  insert into app.sync_changes (
    change_id, server_sequence, organization_id, plant_id, station_id,
    entity_type, entity_id, entity_version, action, changed_at_utc,
    payload_schema_version, payload
  ) values (
    gen_random_uuid(), sequence_value, new.organization_id, new.plant_id, null,
    'INVENTORY_MOVEMENT', new.inventory_movement_id, sequence_value,
    'UPSERT', new.linked_at_utc, 2, payload_value
  );
  return new;
end;
$$;

revoke all on function app.capture_inventory_sweep_link_change_v1()
  from public, anon, authenticated;

create trigger trg_inventory_sweep_links_sync_change
after insert on app.inventory_sweep_links
for each row execute function app.capture_inventory_sweep_link_change_v1();

create function app.ingest_inventory_sync_item_v2(input_item jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  result jsonb;
  payload_value jsonb := input_item -> 'payload';
  linked_sweep_id_value uuid := nullif(payload_value ->> 'linkedSweepId', '')::uuid;
  organization_id_value uuid := (input_item ->> 'organizationId')::uuid;
  plant_id_value uuid := (input_item ->> 'plantId')::uuid;
  movement_id_value uuid := (input_item ->> 'aggregateId')::uuid;
  actor_profile_id_value uuid := (input_item #>> '{authorization,actorProfileId}')::uuid;
  recorded_at_value timestamptz := (payload_value ->> 'recordedAtUtc')::timestamptz;
  existing_sweep_id uuid;
begin
  if linked_sweep_id_value is not null and not exists (
    select 1 from app.production_sweeps as sweep
    where sweep.organization_id = organization_id_value
      and sweep.plant_id = plant_id_value
      and sweep.id = linked_sweep_id_value
  ) then
    return jsonb_build_object(
      'outboxMessageId', (input_item ->> 'outboxMessageId')::uuid,
      'stationSequence', (input_item ->> 'stationSequence')::bigint,
      'status', 'RETRY_LATER', 'code', 'DEPENDENCY_NOT_READY',
      'processedAtUtc', (input_item ->> 'processedAtUtc')::timestamptz
    );
  end if;

  result := app.ingest_inventory_sync_item_v1(input_item);
  if linked_sweep_id_value is null
     or result ->> 'status' not in ('APPLIED', 'ALREADY_APPLIED') then
    return result;
  end if;

  select link.sweep_id into existing_sweep_id
  from app.inventory_sweep_links as link
  where link.organization_id = organization_id_value
    and link.inventory_movement_id = movement_id_value;
  if found then
    if existing_sweep_id is distinct from linked_sweep_id_value then
      return result || jsonb_build_object(
        'status', 'FAILED_REVIEW', 'code', 'INVENTORY_SWEEP_LINK_CONFLICT'
      );
    end if;
    return result;
  end if;

  insert into app.inventory_sweep_links (
    organization_id, plant_id, inventory_movement_id, sweep_id,
    linked_by_profile_id, linked_at_utc
  ) values (
    organization_id_value, plant_id_value, movement_id_value,
    linked_sweep_id_value, actor_profile_id_value, recorded_at_value
  );
  return result;
end;
$$;

revoke all on function app.ingest_inventory_sync_item_v2(jsonb)
  from public, anon, authenticated;
grant execute on function app.ingest_inventory_sync_item_v2(jsonb)
  to service_role;

alter table app.inventory_sweep_links enable row level security;
create policy backend_service_all on app.inventory_sweep_links
  for all to service_role using (true) with check (true);

revoke all on table app.inventory_sweep_links from public, anon, authenticated, service_role;
grant select, insert on table app.inventory_sweep_links to service_role;
revoke all on table
  app.management_inventory_movements,
  app.management_inventory_assignments
from public, anon, authenticated, service_role;
grant select on table
  app.management_inventory_movements,
  app.management_inventory_assignments
to service_role;

comment on table app.inventory_sweep_links is
  'Relacion explicita sin cantidad entre un movimiento fisico de inventario y una barrida.';
comment on view app.management_inventory_assignments is
  'Custodia derivada de salidas de herramientas con trabajador y devoluciones vinculadas.';
