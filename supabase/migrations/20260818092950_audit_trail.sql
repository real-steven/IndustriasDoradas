-- Auditoria transversal append-only para acceso, autorizacion, elevaciones,
-- gobierno de cuentas y mutaciones de negocio.

create type app.audit_actor_kind as enum (
  'AUTHENTICATED_USER',
  'OPERATION_MODE',
  'SYSTEM',
  'UNKNOWN'
);

create type app.audit_result as enum (
  'SUCCEEDED',
  'REJECTED',
  'FAILED'
);

create type app.audit_evidence_state as enum (
  'NOT_APPLICABLE',
  'PENDING',
  'PRESENT',
  'ABSENT'
);

create function app.audit_changes_are_safe(
  changed_fields text[],
  changes jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  field_name text;
  change_value jsonb;
  nested_key text;
begin
  if jsonb_typeof(changes) is distinct from 'object' then
    return false;
  end if;

  if cardinality(changed_fields) <> (
    select count(*)
    from jsonb_object_keys(changes)
  ) then
    return false;
  end if;

  if cardinality(changed_fields) <> (
    select count(distinct field)
    from unnest(changed_fields) as field
  ) then
    return false;
  end if;

  for field_name, change_value in
    select key, value
    from jsonb_each(changes)
  loop
    if not (field_name = any(changed_fields)) then
      return false;
    end if;

    if field_name ~* '(password|contrasena|contraseña|pin|token|secret|authorization|cookie|photo|foto|image|imagen|biometric|biometr)' then
      return false;
    end if;

    if jsonb_typeof(change_value) is distinct from 'object'
       or not (change_value ? 'before')
       or not (change_value ? 'after') then
      return false;
    end if;

    for nested_key in
      select key
      from jsonb_object_keys(change_value) as key
    loop
      if nested_key not in ('before', 'after') then
        return false;
      end if;
    end loop;

    if jsonb_typeof(change_value -> 'before') not in ('string', 'number', 'boolean', 'null')
       or jsonb_typeof(change_value -> 'after') not in ('string', 'number', 'boolean', 'null') then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function app.audit_changes_are_safe(text[], jsonb) from public;
revoke all on function app.audit_changes_are_safe(text[], jsonb) from anon;
revoke all on function app.audit_changes_are_safe(text[], jsonb) from authenticated;
grant execute on function app.audit_changes_are_safe(text[], jsonb) to service_role;

create table app.audit_events (
  id uuid primary key,
  organization_id uuid,
  station_id uuid,
  actor_kind app.audit_actor_kind not null,
  actor_profile_id uuid,
  actor_auth_user_id uuid,
  actor_display_name text,
  actor_role_code text,
  origin text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  correlation_id uuid not null,
  result app.audit_result not null,
  reason_code text,
  evidence_state app.audit_evidence_state not null default 'NOT_APPLICABLE',
  changed_fields text[] not null default '{}',
  changes jsonb not null default '{}'::jsonb,
  request_method text,
  request_path text,
  constraint audit_events_organization_fk foreign key (organization_id)
    references app.organizations (id) on delete restrict,
  constraint audit_events_actor_profile_fk
    foreign key (organization_id, actor_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint audit_events_station_fk
    foreign key (organization_id, station_id)
    references app.stations (organization_id, id) on delete restrict,
  constraint audit_events_actor_profile_context_check check (
    actor_profile_id is null
    or (
      organization_id is not null
      and actor_kind = 'AUTHENTICATED_USER'
      and actor_auth_user_id is not null
      and btrim(coalesce(actor_display_name, '')) <> ''
      and btrim(coalesce(actor_role_code, '')) <> ''
    )
  ),
  constraint audit_events_station_context_check check (
    station_id is null or organization_id is not null
  ),
  constraint audit_events_actor_display_name_check check (
    actor_display_name is null or btrim(actor_display_name) <> ''
  ),
  constraint audit_events_actor_role_code_check check (
    actor_role_code is null
    or actor_role_code = upper(btrim(actor_role_code))
  ),
  constraint audit_events_origin_check check (
    origin in ('API', 'WEB', 'DESKTOP', 'SYNC', 'SYSTEM')
  ),
  constraint audit_events_action_format_check check (
    action = lower(btrim(action))
    and action ~ '^[a-z][a-z0-9_.]*$'
  ),
  constraint audit_events_entity_type_format_check check (
    entity_type = lower(btrim(entity_type))
    and entity_type ~ '^[a-z][a-z0-9_.]*$'
  ),
  constraint audit_events_reason_code_check check (
    reason_code is null
    or (
      reason_code = upper(btrim(reason_code))
      and reason_code ~ '^[A-Z][A-Z0-9_]*$'
    )
  ),
  constraint audit_events_request_pair_check check (
    (request_method is null) = (request_path is null)
  ),
  constraint audit_events_request_method_check check (
    request_method is null
    or request_method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD')
  ),
  constraint audit_events_request_path_check check (
    request_path is null
    or (
      request_path like '/%'
      and request_path not like '%?%'
      and length(request_path) <= 512
    )
  ),
  constraint audit_events_changes_safe_check check (
    app.audit_changes_are_safe(changed_fields, changes)
  )
);

create index ix_audit_events_organization_time
  on app.audit_events (organization_id, occurred_at desc, id);
create index ix_audit_events_actor_time
  on app.audit_events (organization_id, actor_profile_id, occurred_at desc);
create index ix_audit_events_station_time
  on app.audit_events (organization_id, station_id, occurred_at desc);
create index ix_audit_events_correlation
  on app.audit_events (correlation_id);
create index ix_audit_events_entity_time
  on app.audit_events (entity_type, entity_id, occurred_at desc)
  where entity_id is not null;
create index ix_audit_events_action_result_time
  on app.audit_events (action, result, occurred_at desc);

create function app.reject_audit_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'audit events are immutable';
end;
$$;

revoke all on function app.reject_audit_event_mutation() from public;
revoke all on function app.reject_audit_event_mutation() from anon;
revoke all on function app.reject_audit_event_mutation() from authenticated;
grant execute on function app.reject_audit_event_mutation() to service_role;

create trigger trg_audit_events_immutable
before update or delete on app.audit_events
for each row execute function app.reject_audit_event_mutation();

alter table app.audit_events enable row level security;

create policy backend_service_select
on app.audit_events
for select
to service_role
using (true);

create policy backend_service_insert
on app.audit_events
for insert
to service_role
with check (true);

revoke all on table app.audit_events from public;
revoke all on table app.audit_events from anon;
revoke all on table app.audit_events from authenticated;
revoke all on table app.audit_events from service_role;
grant select, insert on table app.audit_events to service_role;

comment on table app.audit_events is
  'Eventos append-only; nunca contiene PIN, contrasena, token, fotografia ni biometria.';
comment on column app.audit_events.changes is
  'Solo campos escalares permitidos con before/after; claves sensibles son rechazadas.';
comment on column app.audit_events.evidence_state is
  'Presencia o ausencia de evidencia futura; no almacena binarios ni URLs firmadas.';
