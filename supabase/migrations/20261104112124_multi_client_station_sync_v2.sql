-- Permite varias instalaciones fisicas bajo una misma estacion logica.
-- Los clientes antiguos se identifican de forma compatible con station_id;
-- los clientes v2 aportan un UUID estable por instalacion.

create table app.sync_client_instances (
  organization_id uuid not null,
  plant_id uuid not null,
  station_id uuid not null,
  client_instance_id uuid not null,
  application text not null,
  application_version text not null,
  last_batch_id uuid not null,
  last_sent_at_utc timestamptz not null,
  first_seen_at_utc timestamptz not null,
  last_seen_at_utc timestamptz not null,
  last_clock_skew_seconds bigint not null,
  primary key (organization_id, station_id, client_instance_id),
  constraint sync_client_instances_station_fk
    foreign key (organization_id, plant_id, station_id)
    references app.stations (organization_id, plant_id, id) on delete restrict,
  constraint sync_client_instances_application_check
    check (btrim(application) <> '' and btrim(application_version) <> ''),
  constraint sync_client_instances_seen_order_check
    check (last_seen_at_utc >= first_seen_at_utc)
);

create index ix_sync_client_instances_last_seen
  on app.sync_client_instances (
    organization_id, plant_id, station_id, last_seen_at_utc desc
  );

alter table app.sync_client_instances enable row level security;
revoke all on table app.sync_client_instances from public, anon, authenticated;
grant select, insert, update on table app.sync_client_instances to service_role;

alter table app.sync_receipts
  add column client_instance_id uuid,
  add column client_sequence bigint;

update app.sync_receipts
set client_instance_id = station_id,
    client_sequence = station_sequence;

alter table app.sync_receipts
  alter column client_instance_id set not null,
  alter column client_sequence set not null,
  add constraint sync_receipts_client_sequence_check
    check (client_sequence > 0),
  add constraint sync_receipts_client_sequence_unique
    unique (
      organization_id, station_id, client_instance_id, client_sequence
    );

create index ix_sync_receipts_client_instance
  on app.sync_receipts (
    organization_id, station_id, client_instance_id, processed_at_utc desc
  );

create sequence app.sync_receipt_storage_sequence_v2 as bigint;

revoke all on sequence app.sync_receipt_storage_sequence_v2
  from public, anon, authenticated;
grant usage, select on sequence app.sync_receipt_storage_sequence_v2
  to service_role;

select pg_catalog.setval(
  'app.sync_receipt_storage_sequence_v2',
  greatest(
    coalesce((select max(station_sequence) from app.sync_receipts), 0) + 1,
    1
  ),
  false
);

create function app.current_sync_client_instance_v2(station_id_value uuid)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  configured text := current_setting('app.sync_client_instance_id', true);
begin
  return coalesce(nullif(configured, '')::uuid, station_id_value);
end;
$$;

create function app.current_sync_client_sequence_v2(sequence_value bigint)
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  configured text := current_setting('app.sync_client_sequence', true);
begin
  return coalesce(nullif(configured, '')::bigint, sequence_value);
end;
$$;

create function app.prepare_sync_client_instance_v2(input_item jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  organization_id_value uuid := (input_item ->> 'organizationId')::uuid;
  plant_id_value uuid := (input_item ->> 'plantId')::uuid;
  station_id_value uuid := (input_item ->> 'stationId')::uuid;
  client_instance_id_value uuid := coalesce(
    nullif(input_item ->> 'clientInstanceId', '')::uuid,
    station_id_value
  );
  outbox_message_id_value uuid := (input_item ->> 'outboxMessageId')::uuid;
  station_sequence_value bigint := (input_item ->> 'stationSequence')::bigint;
  processed_at_value timestamptz :=
    (input_item ->> 'processedAtUtc')::timestamptz;
  sent_at_value timestamptz := coalesce(
    nullif(input_item ->> 'clientSentAtUtc', '')::timestamptz,
    processed_at_value
  );
  existing_outbox_message_id uuid;
  storage_sequence_value bigint;
  sequence_processed_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id_value::text || ':' || station_id_value::text
      || ':client:' || client_instance_id_value::text
      || ':sequence:' || station_sequence_value::text,
    0
  ));

  select receipt.outbox_message_id, receipt.station_sequence,
         receipt.processed_at_utc
    into existing_outbox_message_id, storage_sequence_value,
         sequence_processed_at
  from app.sync_receipts as receipt
  where receipt.organization_id = organization_id_value
    and receipt.station_id = station_id_value
    and receipt.client_instance_id = client_instance_id_value
    and receipt.client_sequence = station_sequence_value;

  if found and existing_outbox_message_id <> outbox_message_id_value then
    return jsonb_build_object(
      'outboxMessageId', outbox_message_id_value,
      'stationSequence', station_sequence_value,
      'status', 'FAILED_REVIEW',
      'code', 'CLIENT_SEQUENCE_CONFLICT',
      'processedAtUtc', sequence_processed_at
    );
  end if;

  if not found then
    storage_sequence_value := nextval('app.sync_receipt_storage_sequence_v2');
  end if;

  perform pg_catalog.set_config(
    'app.sync_client_instance_id', client_instance_id_value::text, true
  );
  perform pg_catalog.set_config(
    'app.sync_client_sequence', station_sequence_value::text, true
  );
  perform pg_catalog.set_config(
    'app.sync_storage_sequence', storage_sequence_value::text, true
  );

  insert into app.sync_client_instances (
    organization_id, plant_id, station_id, client_instance_id,
    application, application_version, last_batch_id, last_sent_at_utc,
    first_seen_at_utc, last_seen_at_utc, last_clock_skew_seconds
  ) values (
    organization_id_value, plant_id_value, station_id_value,
    client_instance_id_value,
    coalesce(nullif(input_item ->> 'clientApplication', ''), 'desktop'),
    coalesce(nullif(input_item ->> 'clientApplicationVersion', ''), 'legacy'),
    coalesce(nullif(input_item ->> 'batchId', '')::uuid, outbox_message_id_value),
    sent_at_value, processed_at_value, processed_at_value,
    round(extract(epoch from processed_at_value - sent_at_value))::bigint
  )
  on conflict (organization_id, station_id, client_instance_id)
  do update set
    application = excluded.application,
    application_version = excluded.application_version,
    last_batch_id = excluded.last_batch_id,
    last_sent_at_utc = excluded.last_sent_at_utc,
    last_seen_at_utc = excluded.last_seen_at_utc,
    last_clock_skew_seconds = excluded.last_clock_skew_seconds;

  return null;
end;
$$;

create function app.prepare_sync_receipt_v2()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  configured text := current_setting('app.sync_client_instance_id', true);
  configured_sequence text := current_setting('app.sync_client_sequence', true);
  storage_sequence text := current_setting('app.sync_storage_sequence', true);
begin
  new.client_instance_id := coalesce(
    nullif(configured, '')::uuid,
    new.client_instance_id,
    new.station_id
  );
  new.client_sequence := coalesce(
    nullif(configured_sequence, '')::bigint,
    new.client_sequence,
    new.station_sequence
  );

  -- Los RPC v2 entregan a las funciones heredadas una secuencia tecnica para
  -- que sus comprobaciones por estacion no confundan dos computadoras.
  if nullif(storage_sequence, '') is not null then
    new.station_sequence := storage_sequence::bigint;
  end if;
  return new;
end;
$$;

create trigger trg_prepare_sync_receipt_v2
before insert on app.sync_receipts
for each row execute function app.prepare_sync_receipt_v2();

-- Cada hecho sincronizable conserva el cliente que lo originó. Los triggers
-- existentes que publican sync_changes incluirán automáticamente esta columna.
alter table app.production_events add column client_instance_id uuid;
alter table app.production_sweeps add column client_instance_id uuid;
alter table app.mercury_movements add column client_instance_id uuid;
alter table app.attendance_events add column client_instance_id uuid;
alter table app.inventory_movements add column client_instance_id uuid;
alter table app.inventory_reviews add column client_instance_id uuid;
alter table app.rastra_component_changes add column client_instance_id uuid;
alter table app.operational_novelty_changes add column client_instance_id uuid;

-- El historial operativo es append-only. No se reescriben filas existentes:
-- los triggers siguientes asignan la instalacion a toda insercion nueva, y las
-- filas historicas sin identidad siguen siendo compatibles como datos legacy.

alter table app.production_events
  drop constraint production_events_station_client_sequence_unique;
alter table app.attendance_events
  drop constraint attendance_events_station_sequence_unique;
drop index app.ux_production_sweeps_station_sequence;
drop index app.ux_mercury_movements_station_sequence;
drop index app.ux_inventory_movements_station_sequence;
drop index app.ux_inventory_reviews_station_sequence;
drop index app.ux_rastra_component_changes_station_sequence;
drop index app.ux_operational_novelty_station_sequence;

alter table app.production_events
  add constraint production_events_client_sequence_unique
  unique (organization_id, station_id, client_instance_id, client_sequence);
alter table app.attendance_events
  add constraint attendance_events_client_sequence_unique
  unique (organization_id, station_id, client_instance_id, client_sequence);
create unique index ux_production_sweeps_client_sequence
  on app.production_sweeps (
    organization_id, station_id, client_instance_id, client_sequence
  );
create unique index ux_mercury_movements_client_sequence
  on app.mercury_movements (
    organization_id, station_id, client_instance_id, client_sequence
  );
create unique index ux_inventory_movements_client_sequence
  on app.inventory_movements (
    organization_id, station_id, client_instance_id, client_sequence
  ) where station_id is not null;
create unique index ux_inventory_reviews_client_sequence
  on app.inventory_reviews (
    organization_id, station_id, client_instance_id, client_sequence
  ) where station_id is not null;
create unique index ux_rastra_component_changes_client_sequence
  on app.rastra_component_changes (
    organization_id, station_id, client_instance_id, client_sequence
  ) where station_id is not null;
create unique index ux_operational_novelty_client_sequence
  on app.operational_novelty_changes (
    organization_id, station_id, client_instance_id, client_sequence
  ) where station_id is not null;

create function app.assign_sync_client_instance_v2()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
begin
  new.client_instance_id := app.current_sync_client_instance_v2(new.station_id);
  new.client_sequence := app.current_sync_client_sequence_v2(new.client_sequence);
  return new;
end;
$$;

create trigger trg_production_events_client_instance
before insert on app.production_events
for each row execute function app.assign_sync_client_instance_v2();
create trigger trg_production_sweeps_client_instance
before insert on app.production_sweeps
for each row execute function app.assign_sync_client_instance_v2();
create trigger trg_mercury_movements_client_instance
before insert on app.mercury_movements
for each row execute function app.assign_sync_client_instance_v2();
create trigger trg_attendance_events_client_instance
before insert on app.attendance_events
for each row execute function app.assign_sync_client_instance_v2();
create trigger trg_inventory_movements_client_instance
before insert on app.inventory_movements
for each row when (new.station_id is not null)
execute function app.assign_sync_client_instance_v2();
create trigger trg_inventory_reviews_client_instance
before insert on app.inventory_reviews
for each row when (new.station_id is not null)
execute function app.assign_sync_client_instance_v2();
create trigger trg_rastra_component_changes_client_instance
before insert on app.rastra_component_changes
for each row when (new.station_id is not null)
execute function app.assign_sync_client_instance_v2();
create trigger trg_operational_novelty_client_instance
before insert on app.operational_novelty_changes
for each row when (new.station_id is not null)
execute function app.assign_sync_client_instance_v2();

create function app.ingest_sync_item_v2(input_item jsonb)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, app as $$
declare
  conflict jsonb;
  original_sequence bigint := (input_item ->> 'stationSequence')::bigint;
  working_item jsonb;
  result jsonb;
begin
  conflict := app.prepare_sync_client_instance_v2(input_item);
  if conflict is not null then return conflict; end if;
  working_item := jsonb_set(
    input_item, '{payload,clientSequence}',
    to_jsonb(current_setting('app.sync_storage_sequence')::bigint), true
  ) || jsonb_build_object(
    'stationSequence', current_setting('app.sync_storage_sequence')::bigint
  );
  result := app.ingest_sync_item_v1(working_item);
  return result || jsonb_build_object('stationSequence', original_sequence);
end;
$$;

create function app.ingest_extended_sync_item_v2(input_item jsonb)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, app as $$
declare
  conflict jsonb;
  original_sequence bigint := (input_item ->> 'stationSequence')::bigint;
  working_item jsonb;
  result jsonb;
begin
  conflict := app.prepare_sync_client_instance_v2(input_item);
  if conflict is not null then return conflict; end if;
  working_item := jsonb_set(
    input_item, '{payload,clientSequence}',
    to_jsonb(current_setting('app.sync_storage_sequence')::bigint), true
  ) || jsonb_build_object(
    'stationSequence', current_setting('app.sync_storage_sequence')::bigint
  );
  result := app.ingest_extended_sync_item_v1(working_item);
  return result || jsonb_build_object('stationSequence', original_sequence);
end;
$$;

create function app.ingest_attendance_sync_item_v2(input_item jsonb)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, app as $$
declare
  conflict jsonb;
  original_sequence bigint := (input_item ->> 'stationSequence')::bigint;
  working_item jsonb;
  result jsonb;
begin
  conflict := app.prepare_sync_client_instance_v2(input_item);
  if conflict is not null then return conflict; end if;
  working_item := jsonb_set(
    input_item, '{payload,clientSequence}',
    to_jsonb(current_setting('app.sync_storage_sequence')::bigint), true
  ) || jsonb_build_object(
    'stationSequence', current_setting('app.sync_storage_sequence')::bigint
  );
  result := app.ingest_attendance_sync_item_v1(working_item);
  return result || jsonb_build_object('stationSequence', original_sequence);
end;
$$;

create function app.ingest_inventory_sync_item_v3(input_item jsonb)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, app as $$
declare
  conflict jsonb;
  original_sequence bigint := (input_item ->> 'stationSequence')::bigint;
  working_item jsonb;
  result jsonb;
begin
  conflict := app.prepare_sync_client_instance_v2(input_item);
  if conflict is not null then return conflict; end if;
  working_item := jsonb_set(
    input_item, '{payload,clientSequence}',
    to_jsonb(current_setting('app.sync_storage_sequence')::bigint), true
  ) || jsonb_build_object(
    'stationSequence', current_setting('app.sync_storage_sequence')::bigint
  );
  result := app.ingest_inventory_sync_item_v2(working_item);
  return result || jsonb_build_object('stationSequence', original_sequence);
end;
$$;

create function app.ingest_inventory_maintenance_sync_item_v2(input_item jsonb)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, app as $$
declare
  conflict jsonb;
  original_sequence bigint := (input_item ->> 'stationSequence')::bigint;
  working_item jsonb;
  result jsonb;
begin
  conflict := app.prepare_sync_client_instance_v2(input_item);
  if conflict is not null then return conflict; end if;
  working_item := jsonb_set(
    input_item, '{payload,clientSequence}',
    to_jsonb(current_setting('app.sync_storage_sequence')::bigint), true
  ) || jsonb_build_object(
    'stationSequence', current_setting('app.sync_storage_sequence')::bigint
  );
  result := app.ingest_inventory_maintenance_sync_item_v1(working_item);
  return result || jsonb_build_object('stationSequence', original_sequence);
end;
$$;

revoke all on function app.current_sync_client_instance_v2(uuid)
  from public, anon, authenticated;
revoke all on function app.current_sync_client_sequence_v2(bigint)
  from public, anon, authenticated;
revoke all on function app.prepare_sync_client_instance_v2(jsonb)
  from public, anon, authenticated;
revoke all on function app.prepare_sync_receipt_v2()
  from public, anon, authenticated;
revoke all on function app.assign_sync_client_instance_v2()
  from public, anon, authenticated;
revoke all on function app.ingest_sync_item_v2(jsonb)
  from public, anon, authenticated;
revoke all on function app.ingest_extended_sync_item_v2(jsonb)
  from public, anon, authenticated;
revoke all on function app.ingest_attendance_sync_item_v2(jsonb)
  from public, anon, authenticated;
revoke all on function app.ingest_inventory_sync_item_v3(jsonb)
  from public, anon, authenticated;
revoke all on function app.ingest_inventory_maintenance_sync_item_v2(jsonb)
  from public, anon, authenticated;

grant execute on function app.current_sync_client_instance_v2(uuid)
  to service_role;
grant execute on function app.current_sync_client_sequence_v2(bigint)
  to service_role;
grant execute on function app.prepare_sync_client_instance_v2(jsonb)
  to service_role;
grant execute on function app.ingest_sync_item_v2(jsonb) to service_role;
grant execute on function app.ingest_extended_sync_item_v2(jsonb) to service_role;
grant execute on function app.ingest_attendance_sync_item_v2(jsonb) to service_role;
grant execute on function app.ingest_inventory_sync_item_v3(jsonb) to service_role;
grant execute on function app.ingest_inventory_maintenance_sync_item_v2(jsonb)
  to service_role;

comment on table app.sync_client_instances is
  'Instalaciones fisicas que comparten una estacion logica y su ultimo lote.';
comment on column app.sync_receipts.client_instance_id is
  'UUID estable de la instalacion que produjo el mensaje.';
comment on column app.sync_receipts.client_sequence is
  'Secuencia local original dentro de la instalacion; station_sequence queda como clave tecnica compatible.';
