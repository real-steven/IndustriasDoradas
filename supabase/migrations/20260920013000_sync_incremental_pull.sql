create table app.sync_changes (
  change_id uuid primary key,
  server_sequence bigint not null unique,
  organization_id uuid not null,
  plant_id uuid,
  station_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  entity_version bigint not null,
  action text not null,
  changed_at_utc timestamptz not null,
  payload_schema_version integer not null default 1,
  payload jsonb not null,
  constraint sync_changes_organization_fk foreign key (organization_id)
    references app.organizations (id) on delete restrict,
  constraint sync_changes_action_check
    check (action in ('UPSERT', 'DEACTIVATE', 'CORRECTION_APPENDED')),
  constraint sync_changes_entity_type_check check (
    entity_type in (
      'SUPPLIER', 'WORKER', 'PRODUCTION_LINE', 'LINE_COMPONENT',
      'STATION', 'STATION_LINE_SCOPE', 'SHIPMENT',
      'RESPONSIBILITY_ASSIGNMENT'
    )
  ),
  constraint sync_changes_positive_sequence_check
    check (server_sequence > 0 and entity_version > 0),
  constraint sync_changes_payload_object_check
    check (jsonb_typeof(payload) = 'object')
);

create sequence app.sync_changes_server_sequence_seq owned by app.sync_changes.server_sequence;

create index ix_sync_changes_pull
  on app.sync_changes (organization_id, server_sequence);
create index ix_sync_changes_plant_pull
  on app.sync_changes (organization_id, plant_id, server_sequence);
create index ix_sync_changes_station_pull
  on app.sync_changes (organization_id, station_id, server_sequence);

alter table app.sync_changes enable row level security;
revoke all on table app.sync_changes from public, anon, authenticated;
grant select, insert on table app.sync_changes to service_role;
revoke all on sequence app.sync_changes_server_sequence_seq from public, anon, authenticated;
grant usage, select on sequence app.sync_changes_server_sequence_seq to service_role;

create function app.capture_sync_change_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  row_data jsonb := to_jsonb(new);
  sequence_value bigint := nextval('app.sync_changes_server_sequence_seq');
  organization_value uuid := (row_data ->> 'organization_id')::uuid;
  plant_value uuid;
  station_value uuid;
  entity_type_value text;
  entity_id_value uuid;
  action_value text := 'UPSERT';
begin
  case tg_table_name
    when 'suppliers' then
      entity_type_value := 'SUPPLIER';
      entity_id_value := new.id;
    when 'workers' then
      entity_type_value := 'WORKER';
      entity_id_value := new.id;
      plant_value := new.plant_id;
    when 'production_lines' then
      entity_type_value := 'PRODUCTION_LINE';
      entity_id_value := new.id;
      plant_value := new.plant_id;
    when 'line_components' then
      entity_type_value := 'LINE_COMPONENT';
      entity_id_value := new.id;
      select line.plant_id into plant_value
      from app.production_lines line
      where line.organization_id = new.organization_id
        and line.id = new.production_line_id;
    when 'stations' then
      entity_type_value := 'STATION';
      entity_id_value := new.id;
      plant_value := new.plant_id;
      station_value := new.id;
    when 'station_line_scopes' then
      entity_type_value := 'STATION_LINE_SCOPE';
      entity_id_value := new.production_line_id;
      plant_value := new.plant_id;
      station_value := new.station_id;
    when 'shipments' then
      entity_type_value := 'SHIPMENT';
      entity_id_value := new.id;
      plant_value := new.plant_id;
      station_value := new.station_id;
    when 'responsibility_assignments' then
      entity_type_value := 'RESPONSIBILITY_ASSIGNMENT';
      entity_id_value := new.id;
      select shipment.plant_id, shipment.station_id
        into plant_value, station_value
      from app.shipments shipment
      where shipment.organization_id = new.organization_id
        and shipment.id = new.shipment_id;
    else
      raise exception using errcode = '23514', message = 'unsupported sync change source';
  end case;

  if row_data ? 'is_active' and coalesce((row_data ->> 'is_active')::boolean, false) = false then
    action_value := 'DEACTIVATE';
  end if;

  insert into app.sync_changes (
    change_id, server_sequence, organization_id, plant_id, station_id,
    entity_type, entity_id, entity_version, action, changed_at_utc,
    payload_schema_version, payload
  ) values (
    gen_random_uuid(), sequence_value, organization_value, plant_value, station_value,
    entity_type_value, entity_id_value, sequence_value, action_value, now(), 1, row_data
  );
  return new;
end;
$$;

revoke all on function app.capture_sync_change_v1() from public, anon, authenticated;

create trigger trg_suppliers_sync_change after insert or update on app.suppliers
for each row execute function app.capture_sync_change_v1();
create trigger trg_workers_sync_change after insert or update on app.workers
for each row execute function app.capture_sync_change_v1();
create trigger trg_production_lines_sync_change after insert or update on app.production_lines
for each row execute function app.capture_sync_change_v1();
create trigger trg_line_components_sync_change after insert or update on app.line_components
for each row execute function app.capture_sync_change_v1();
create trigger trg_stations_sync_change after insert or update on app.stations
for each row execute function app.capture_sync_change_v1();
create trigger trg_station_line_scopes_sync_change after insert or update on app.station_line_scopes
for each row execute function app.capture_sync_change_v1();
create trigger trg_shipments_sync_change after insert or update on app.shipments
for each row execute function app.capture_sync_change_v1();
create trigger trg_responsibility_assignments_sync_change
after insert or update on app.responsibility_assignments
for each row execute function app.capture_sync_change_v1();

do $$
declare
  existing record;
  sequence_value bigint;
begin
  for existing in
    select 'SUPPLIER'::text entity_type, id entity_id, organization_id,
           null::uuid plant_id, null::uuid station_id, to_jsonb(supplier) payload
    from app.suppliers supplier
    union all
    select 'WORKER', id, organization_id, plant_id, null::uuid, to_jsonb(worker)
    from app.workers worker
    union all
    select 'PRODUCTION_LINE', id, organization_id, plant_id, null::uuid, to_jsonb(line)
    from app.production_lines line
    union all
    select 'LINE_COMPONENT', component.id, component.organization_id, line.plant_id,
           null::uuid, to_jsonb(component)
    from app.line_components component
    join app.production_lines line
      on line.organization_id = component.organization_id
     and line.id = component.production_line_id
    union all
    select 'STATION', id, organization_id, plant_id, id, to_jsonb(station)
    from app.stations station
    union all
    select 'STATION_LINE_SCOPE', production_line_id, organization_id, plant_id,
           station_id, to_jsonb(scope)
    from app.station_line_scopes scope
    union all
    select 'SHIPMENT', id, organization_id, plant_id, station_id, to_jsonb(shipment)
    from app.shipments shipment
    union all
    select 'RESPONSIBILITY_ASSIGNMENT', assignment.id, assignment.organization_id,
           shipment.plant_id, shipment.station_id, to_jsonb(assignment)
    from app.responsibility_assignments assignment
    join app.shipments shipment
      on shipment.organization_id = assignment.organization_id
     and shipment.id = assignment.shipment_id
  loop
    sequence_value := nextval('app.sync_changes_server_sequence_seq');
    insert into app.sync_changes (
      change_id, server_sequence, organization_id, plant_id, station_id,
      entity_type, entity_id, entity_version, action, changed_at_utc, payload
    )
    values (gen_random_uuid(), sequence_value, existing.organization_id, existing.plant_id,
           existing.station_id, existing.entity_type, existing.entity_id, sequence_value,
           case when existing.payload ? 'is_active'
                     and coalesce((existing.payload ->> 'is_active')::boolean, false) = false
                then 'DEACTIVATE' else 'UPSERT' end,
           now(), existing.payload);
  end loop;
end;
$$;
