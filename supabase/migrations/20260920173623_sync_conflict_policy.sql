-- Sprint 3.6: clasifica conflictos contra la configuracion central sin
-- reescribir ni eliminar los hechos confirmados en la estacion.

create function app.sync_conflict_code_v1(input_item jsonb)
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

revoke all on function app.sync_conflict_code_v1(jsonb)
  from public, anon, authenticated;
grant execute on function app.sync_conflict_code_v1(jsonb) to service_role;

alter function app.ingest_sync_item_v1(jsonb)
  rename to ingest_sync_item_v1_conflict_base;

revoke all on function app.ingest_sync_item_v1_conflict_base(jsonb)
  from public, anon, authenticated;
grant execute on function app.ingest_sync_item_v1_conflict_base(jsonb)
  to service_role;

create function app.ingest_sync_item_v1(input_item jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  organization_id_value uuid := (input_item ->> 'organizationId')::uuid;
  station_id_value uuid := (input_item ->> 'stationId')::uuid;
  outbox_message_id_value uuid := (input_item ->> 'outboxMessageId')::uuid;
  working_item jsonb := input_item;
  policy_code text;
  lock_key text;
begin
  lock_key := organization_id_value::text || ':' || station_id_value::text
    || ':' || outbox_message_id_value::text;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(lock_key, 0)
  );

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

revoke all on function app.ingest_sync_item_v1(jsonb)
  from public, anon, authenticated;
grant execute on function app.ingest_sync_item_v1(jsonb) to service_role;

comment on function app.sync_conflict_code_v1(jsonb) is
  'Clasifica revocaciones, version de permisos y reloj futuro antes de ingerir.';
comment on function app.ingest_sync_item_v1_conflict_base(jsonb) is
  'Implementacion 3.2-3.5 protegida por la politica de conflictos 3.6.';
comment on function app.ingest_sync_item_v1(jsonb) is
  'Aplica la politica 3.6 y conserva cada rechazo como recibo auditable.';
