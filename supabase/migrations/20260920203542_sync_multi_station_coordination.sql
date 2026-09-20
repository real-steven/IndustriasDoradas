-- Sprint 3.7: registra cada estacion como cliente de sincronizacion v1 y
-- serializa el inicio de cargamentos por linea. Los solapamientos historicos
-- se conservan; la politica solo impide crear uno nuevo por la RPC publica.

create table app.sync_clients (
  station_id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  application text not null,
  application_version text not null,
  last_batch_id uuid not null,
  last_sent_at_utc timestamptz not null,
  first_seen_at_utc timestamptz not null,
  last_seen_at_utc timestamptz not null,
  last_clock_skew_seconds bigint not null,
  constraint sync_clients_station_fk
    foreign key (organization_id, plant_id, station_id)
    references app.stations (organization_id, plant_id, id) on delete restrict,
  constraint sync_clients_application_not_blank_check
    check (btrim(application) <> ''),
  constraint sync_clients_version_not_blank_check
    check (btrim(application_version) <> ''),
  constraint sync_clients_seen_order_check
    check (last_seen_at_utc >= first_seen_at_utc)
);

create index ix_sync_clients_plant_last_seen
  on app.sync_clients (organization_id, plant_id, last_seen_at_utc desc);

create index ix_shipments_active_line_coordination
  on app.shipments (organization_id, plant_id, production_line_id)
  where status = 'ACTIVE';

alter table app.sync_clients enable row level security;
revoke all on table app.sync_clients from public, anon, authenticated;
grant select, insert, update on table app.sync_clients to service_role;

create or replace function app.sync_conflict_code_v1(input_item jsonb)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  payload_value jsonb := input_item -> 'payload';
  organization_id_value uuid := (input_item ->> 'organizationId')::uuid;
  plant_id_value uuid := (input_item ->> 'plantId')::uuid;
  station_id_value uuid := (input_item ->> 'stationId')::uuid;
  operation_type_value text := input_item ->> 'operationType';
  aggregate_id_value uuid := (input_item ->> 'aggregateId')::uuid;
  actor_profile_id_value uuid :=
    (input_item #>> '{authorization,actorProfileId}')::uuid;
  captured_permission_version integer :=
    (input_item #>> '{authorization,permissionVersion}')::integer;
  processed_at_value timestamptz :=
    (input_item ->> 'processedAtUtc')::timestamptz;
  created_at_value timestamptz :=
    (input_item ->> 'createdAtUtc')::timestamptz;
  occurred_at_value timestamptz := coalesce(
    nullif(payload_value ->> 'occurredAtUtc', '')::timestamptz,
    created_at_value
  );
  recorded_at_value timestamptz :=
    nullif(payload_value ->> 'recordedAtUtc', '')::timestamptz;
  line_id_value uuid := nullif(payload_value ->> 'lineId', '')::uuid;
  station_active boolean;
  current_permission_version integer;
  authorization_active boolean;
  line_active boolean;
  scope_active boolean;
begin
  select station.is_active, station.permission_version
    into station_active, current_permission_version
  from app.stations as station
  where station.organization_id = organization_id_value
    and station.plant_id = plant_id_value
    and station.id = station_id_value;

  if not found then
    return 'SCOPE_MISMATCH';
  end if;
  if not station_active then
    return 'STATION_REVOKED';
  end if;

  select station_auth.is_active
    into authorization_active
  from app.station_user_authorizations as station_auth
  where station_auth.organization_id = organization_id_value
    and station_auth.plant_id = plant_id_value
    and station_auth.station_id = station_id_value
    and station_auth.user_profile_id = actor_profile_id_value;

  if not found or not authorization_active then
    return 'SCOPE_MISMATCH';
  end if;
  if captured_permission_version <> current_permission_version then
    return 'PERMISSION_VERSION_MISMATCH';
  end if;

  if line_id_value is not null then
    select line.is_active
      into line_active
    from app.production_lines as line
    where line.organization_id = organization_id_value
      and line.plant_id = plant_id_value
      and line.id = line_id_value;

    if found and not line_active then
      return 'LINE_REVOKED';
    end if;

    select scope.is_active
      into scope_active
    from app.station_line_scopes as scope
    where scope.organization_id = organization_id_value
      and scope.plant_id = plant_id_value
      and scope.station_id = station_id_value
      and scope.production_line_id = line_id_value;

    if found and not scope_active then
      return 'LINE_REVOKED';
    end if;
  end if;

  if operation_type_value = 'OPERATION_STARTED'
     and line_id_value is not null
     and exists (
       select 1
       from app.shipments as shipment
       where shipment.organization_id = organization_id_value
         and shipment.plant_id = plant_id_value
         and shipment.production_line_id = line_id_value
         and shipment.status = 'ACTIVE'
         and shipment.id <> aggregate_id_value
     ) then
    return 'LINE_OPERATION_CONFLICT';
  end if;

  -- Una cola offline puede contener hechos antiguos; solo una hora futura
  -- respecto del servidor demuestra una desviacion no explicable por latencia.
  if created_at_value > processed_at_value + interval '5 minutes'
     or occurred_at_value > processed_at_value + interval '5 minutes'
     or recorded_at_value > processed_at_value + interval '5 minutes' then
    return 'CLOCK_SKEW_REVIEW';
  end if;

  return null;
end;
$$;

create or replace function app.ingest_sync_item_v1(input_item jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  organization_id_value uuid := (input_item ->> 'organizationId')::uuid;
  plant_id_value uuid := (input_item ->> 'plantId')::uuid;
  station_id_value uuid := (input_item ->> 'stationId')::uuid;
  outbox_message_id_value uuid := (input_item ->> 'outboxMessageId')::uuid;
  operation_type_value text := input_item ->> 'operationType';
  line_id_value uuid := nullif(input_item #>> '{payload,lineId}', '')::uuid;
  processed_at_value timestamptz :=
    (input_item ->> 'processedAtUtc')::timestamptz;
  sent_at_value timestamptz := coalesce(
    nullif(input_item ->> 'clientSentAtUtc', '')::timestamptz,
    processed_at_value
  );
  working_item jsonb := input_item;
  policy_code text;
  lock_key text;
begin
  lock_key := organization_id_value::text || ':' || station_id_value::text
    || ':' || outbox_message_id_value::text;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(lock_key, 0)
  );

  insert into app.sync_clients (
    station_id,
    organization_id,
    plant_id,
    application,
    application_version,
    last_batch_id,
    last_sent_at_utc,
    first_seen_at_utc,
    last_seen_at_utc,
    last_clock_skew_seconds
  ) values (
    station_id_value,
    organization_id_value,
    plant_id_value,
    coalesce(nullif(input_item ->> 'clientApplication', ''), 'desktop'),
    coalesce(nullif(input_item ->> 'clientApplicationVersion', ''), 'legacy'),
    coalesce(
      nullif(input_item ->> 'batchId', '')::uuid,
      outbox_message_id_value
    ),
    sent_at_value,
    processed_at_value,
    processed_at_value,
    pg_catalog.round(
      extract(epoch from processed_at_value - sent_at_value)
    )::bigint
  )
  on conflict (station_id) do update set
    application = excluded.application,
    application_version = excluded.application_version,
    last_batch_id = excluded.last_batch_id,
    last_sent_at_utc = excluded.last_sent_at_utc,
    last_seen_at_utc = excluded.last_seen_at_utc,
    last_clock_skew_seconds = excluded.last_clock_skew_seconds;

  -- Todos los inicios para una misma linea comparten el mismo bloqueo. La
  -- consulta de conflicto ocurre despues del bloqueo, incluso con dos PC.
  if operation_type_value = 'OPERATION_STARTED' and line_id_value is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      organization_id_value::text || ':' || plant_id_value::text
        || ':line:' || line_id_value::text, 0
    ));
  end if;

  if nullif(input_item ->> 'precheckCode', '') is null then
    policy_code := app.sync_conflict_code_v1(input_item);
    if policy_code is not null then
      working_item := input_item
        || jsonb_build_object('precheckCode', policy_code);
    end if;
  end if;

  return app.ingest_sync_item_v1_conflict_base(working_item);
end;
$$;

revoke all on function app.sync_conflict_code_v1(jsonb)
  from public, anon, authenticated;
grant execute on function app.sync_conflict_code_v1(jsonb) to service_role;
revoke all on function app.ingest_sync_item_v1(jsonb)
  from public, anon, authenticated;
grant execute on function app.ingest_sync_item_v1(jsonb) to service_role;

comment on table app.sync_clients is
  'Cliente v1 por estacion: version, ultimo lote, ultima comunicacion y desviacion horaria.';
comment on function app.sync_conflict_code_v1(jsonb) is
  'Clasifica configuracion revocada, reloj futuro y doble operacion activa por linea.';
comment on function app.ingest_sync_item_v1(jsonb) is
  'Registra el cliente y serializa inicios por linea antes de aplicar la politica 3.7.';
