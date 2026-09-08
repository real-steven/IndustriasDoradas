-- Sprint 1.3: identidad, organizacion y catalogos iniciales.
-- Version registrada en Supabase: 20260817182220.
-- Esta es la primera migracion productiva. El esquema demo_supervisor no es
-- fuente ni dependencia de este archivo.

create schema if not exists app;

revoke all on schema app from public;
revoke all on schema app from anon;
revoke all on schema app from authenticated;
grant usage on schema app to service_role;

create type app.account_status as enum (
  'PENDING_APPROVAL',
  'ACTIVE',
  'SUSPENDED'
);

create type app.worker_request_status as enum (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'MERGED'
);

create type app.worker_status as enum (
  'PROVISIONAL',
  'PROVISIONAL_VENCIDO',
  'ACTIVO',
  'RECHAZADO'
);

create function app.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function app.set_updated_at() from public;
revoke all on function app.set_updated_at() from anon;
revoke all on function app.set_updated_at() from authenticated;
grant execute on function app.set_updated_at() to service_role;

create table app.organizations (
  id uuid primary key,
  code text not null,
  name text not null,
  default_timezone text not null default 'America/Costa_Rica',
  default_locale text not null default 'es',
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_code_format_check
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
  constraint organizations_name_not_blank_check check (btrim(name) <> ''),
  constraint organizations_timezone_not_blank_check
    check (btrim(default_timezone) <> ''),
  constraint organizations_locale_check check (default_locale in ('es', 'en')),
  constraint organizations_deactivation_check
    check ((is_active and deactivated_at is null) or (not is_active and deactivated_at is not null)),
  constraint organizations_updated_after_created_check check (updated_at >= created_at)
);

create unique index ux_organizations_code_normalized
  on app.organizations (lower(code));

create table app.plants (
  id uuid primary key,
  organization_id uuid not null,
  code text not null,
  name text not null,
  timezone text not null default 'America/Costa_Rica',
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plants_organization_id_id_unique unique (organization_id, id),
  constraint plants_organization_fk foreign key (organization_id)
    references app.organizations (id) on delete restrict,
  constraint plants_code_format_check
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
  constraint plants_name_not_blank_check check (btrim(name) <> ''),
  constraint plants_timezone_not_blank_check check (btrim(timezone) <> ''),
  constraint plants_deactivation_check
    check ((is_active and deactivated_at is null) or (not is_active and deactivated_at is not null)),
  constraint plants_updated_after_created_check check (updated_at >= created_at)
);

create unique index ux_plants_code_per_organization
  on app.plants (organization_id, lower(code));
create unique index ux_plants_name_per_organization
  on app.plants (organization_id, lower(btrim(name)));
create index ix_plants_active
  on app.plants (organization_id, is_active);

create table app.production_lines (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  code text not null,
  name text not null,
  display_order integer not null,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_lines_organization_plant_id_unique
    unique (organization_id, plant_id, id),
  constraint production_lines_organization_id_id_unique
    unique (organization_id, id),
  constraint production_lines_plant_fk foreign key (organization_id, plant_id)
    references app.plants (organization_id, id) on delete restrict,
  constraint production_lines_code_format_check
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
  constraint production_lines_name_not_blank_check check (btrim(name) <> ''),
  constraint production_lines_display_order_check check (display_order > 0),
  constraint production_lines_deactivation_check
    check ((is_active and deactivated_at is null) or (not is_active and deactivated_at is not null)),
  constraint production_lines_updated_after_created_check check (updated_at >= created_at)
);

create unique index ux_production_lines_code_per_plant
  on app.production_lines (organization_id, plant_id, lower(code));
create unique index ux_production_lines_name_per_plant
  on app.production_lines (organization_id, plant_id, lower(btrim(name)));
create unique index ux_production_lines_order_per_plant
  on app.production_lines (organization_id, plant_id, display_order);
create index ix_production_lines_active_order
  on app.production_lines (organization_id, plant_id, is_active, display_order);

create table app.line_component_types (
  id uuid primary key,
  code text not null,
  name_es text not null,
  name_en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_component_types_code_format_check
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
  constraint line_component_types_name_es_not_blank_check check (btrim(name_es) <> ''),
  constraint line_component_types_name_en_not_blank_check check (btrim(name_en) <> ''),
  constraint line_component_types_updated_after_created_check check (updated_at >= created_at)
);

create unique index ux_line_component_types_code
  on app.line_component_types (lower(code));

create table app.line_components (
  id uuid primary key,
  organization_id uuid not null,
  production_line_id uuid not null,
  component_type_id uuid not null,
  code text not null,
  name text not null,
  display_order integer not null,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_components_organization_id_id_unique unique (organization_id, id),
  constraint line_components_line_fk foreign key (organization_id, production_line_id)
    references app.production_lines (organization_id, id) on delete restrict,
  constraint line_components_type_fk foreign key (component_type_id)
    references app.line_component_types (id) on delete restrict,
  constraint line_components_code_format_check
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
  constraint line_components_name_not_blank_check check (btrim(name) <> ''),
  constraint line_components_display_order_check check (display_order > 0),
  constraint line_components_deactivation_check
    check ((is_active and deactivated_at is null) or (not is_active and deactivated_at is not null)),
  constraint line_components_updated_after_created_check check (updated_at >= created_at)
);

create unique index ux_line_components_code_per_line
  on app.line_components (organization_id, production_line_id, lower(code));
create unique index ux_line_components_name_per_line
  on app.line_components (organization_id, production_line_id, lower(btrim(name)));
create unique index ux_line_components_order_per_line
  on app.line_components (organization_id, production_line_id, display_order);
create index ix_line_components_active_order
  on app.line_components (organization_id, production_line_id, is_active, display_order);

create table app.stations (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  code text not null,
  name text not null,
  device_key text not null,
  permission_version integer not null default 1,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stations_organization_plant_id_unique unique (organization_id, plant_id, id),
  constraint stations_organization_id_id_unique unique (organization_id, id),
  constraint stations_plant_fk foreign key (organization_id, plant_id)
    references app.plants (organization_id, id) on delete restrict,
  constraint stations_code_format_check
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
  constraint stations_name_not_blank_check check (btrim(name) <> ''),
  constraint stations_device_key_not_blank_check check (btrim(device_key) <> ''),
  constraint stations_permission_version_check check (permission_version > 0),
  constraint stations_deactivation_check
    check ((is_active and deactivated_at is null) or (not is_active and deactivated_at is not null)),
  constraint stations_updated_after_created_check check (updated_at >= created_at)
);

create unique index ux_stations_code_per_plant
  on app.stations (organization_id, plant_id, lower(code));
create unique index ux_stations_name_per_plant
  on app.stations (organization_id, plant_id, lower(btrim(name)));
create unique index ux_stations_device_key on app.stations (device_key);
create index ix_stations_active
  on app.stations (organization_id, plant_id, is_active);

create table app.station_line_scopes (
  organization_id uuid not null,
  plant_id uuid not null,
  station_id uuid not null,
  production_line_id uuid not null,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint station_line_scopes_pk
    primary key (organization_id, station_id, production_line_id),
  constraint station_line_scopes_station_fk
    foreign key (organization_id, plant_id, station_id)
    references app.stations (organization_id, plant_id, id) on delete restrict,
  constraint station_line_scopes_line_fk
    foreign key (organization_id, plant_id, production_line_id)
    references app.production_lines (organization_id, plant_id, id) on delete restrict,
  constraint station_line_scopes_deactivation_check
    check ((is_active and deactivated_at is null) or (not is_active and deactivated_at is not null)),
  constraint station_line_scopes_updated_after_created_check check (updated_at >= created_at)
);

create index ix_station_line_scopes_line
  on app.station_line_scopes (organization_id, plant_id, production_line_id, is_active);

create table app.roles (
  id uuid primary key,
  code text not null,
  name_es text not null,
  name_en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_code_format_check
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
  constraint roles_code_allowed_check
    check (code in ('JEFE_EMPRESA', 'ADMINISTRADOR', 'JEFE_PLANTA')),
  constraint roles_name_es_not_blank_check check (btrim(name_es) <> ''),
  constraint roles_name_en_not_blank_check check (btrim(name_en) <> ''),
  constraint roles_updated_after_created_check check (updated_at >= created_at)
);

create unique index ux_roles_code on app.roles (lower(code));

create table app.permissions (
  id uuid primary key,
  code text not null,
  description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permissions_code_format_check
    check (code = lower(btrim(code)) and code ~ '^[a-z][a-z0-9_.]*$'),
  constraint permissions_description_not_blank_check check (btrim(description) <> ''),
  constraint permissions_updated_after_created_check check (updated_at >= created_at)
);

create unique index ux_permissions_code on app.permissions (lower(code));

create table app.role_permissions (
  role_id uuid not null,
  permission_id uuid not null,
  created_at timestamptz not null default now(),
  constraint role_permissions_pk primary key (role_id, permission_id),
  constraint role_permissions_role_fk foreign key (role_id)
    references app.roles (id) on delete restrict,
  constraint role_permissions_permission_fk foreign key (permission_id)
    references app.permissions (id) on delete restrict
);

create index ix_role_permissions_permission
  on app.role_permissions (permission_id, role_id);

create table app.user_profiles (
  id uuid primary key,
  organization_id uuid not null,
  auth_user_id uuid not null,
  role_id uuid not null,
  display_name text not null,
  preferred_locale text not null default 'es',
  account_status app.account_status not null default 'PENDING_APPROVAL',
  approved_by_profile_id uuid,
  approved_at timestamptz,
  suspended_by_profile_id uuid,
  suspended_at timestamptz,
  status_reason text,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_organization_id_id_unique unique (organization_id, id),
  constraint user_profiles_auth_user_unique unique (auth_user_id),
  constraint user_profiles_organization_fk foreign key (organization_id)
    references app.organizations (id) on delete restrict,
  constraint user_profiles_auth_user_fk foreign key (auth_user_id)
    references auth.users (id) on delete restrict,
  constraint user_profiles_role_fk foreign key (role_id)
    references app.roles (id) on delete restrict,
  constraint user_profiles_approved_by_fk
    foreign key (organization_id, approved_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint user_profiles_suspended_by_fk
    foreign key (organization_id, suspended_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint user_profiles_display_name_not_blank_check check (btrim(display_name) <> ''),
  constraint user_profiles_locale_check check (preferred_locale in ('es', 'en')),
  constraint user_profiles_approval_pair_check
    check ((approved_by_profile_id is null) = (approved_at is null)),
  constraint user_profiles_suspension_pair_check
    check ((suspended_by_profile_id is null) = (suspended_at is null)),
  constraint user_profiles_suspension_reason_check
    check (account_status <> 'SUSPENDED' or btrim(coalesce(status_reason, '')) <> ''),
  constraint user_profiles_deactivation_check
    check ((is_active and deactivated_at is null) or (not is_active and deactivated_at is not null)),
  constraint user_profiles_updated_after_created_check check (updated_at >= created_at)
);

create index ix_user_profiles_authorization
  on app.user_profiles (organization_id, role_id, account_status, is_active);

create table app.user_plant_scopes (
  organization_id uuid not null,
  user_profile_id uuid not null,
  plant_id uuid not null,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_plant_scopes_pk
    primary key (organization_id, user_profile_id, plant_id),
  constraint user_plant_scopes_user_fk foreign key (organization_id, user_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint user_plant_scopes_plant_fk foreign key (organization_id, plant_id)
    references app.plants (organization_id, id) on delete restrict,
  constraint user_plant_scopes_deactivation_check
    check ((is_active and deactivated_at is null) or (not is_active and deactivated_at is not null)),
  constraint user_plant_scopes_updated_after_created_check check (updated_at >= created_at)
);

create index ix_user_plant_scopes_plant
  on app.user_plant_scopes (organization_id, plant_id, is_active);

create table app.station_user_authorizations (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  station_id uuid not null,
  user_profile_id uuid not null,
  authorized_by_profile_id uuid not null,
  authorized_at timestamptz not null default now(),
  is_active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by_profile_id uuid,
  deactivation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint station_user_authorizations_organization_id_id_unique
    unique (organization_id, id),
  constraint station_user_authorizations_user_station_unique
    unique (organization_id, station_id, user_profile_id),
  constraint station_user_authorizations_station_fk
    foreign key (organization_id, plant_id, station_id)
    references app.stations (organization_id, plant_id, id) on delete restrict,
  constraint station_user_authorizations_scope_fk
    foreign key (organization_id, user_profile_id, plant_id)
    references app.user_plant_scopes (organization_id, user_profile_id, plant_id)
    on delete restrict,
  constraint station_user_authorizations_authorized_by_fk
    foreign key (organization_id, authorized_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint station_user_authorizations_deactivated_by_fk
    foreign key (organization_id, deactivated_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint station_user_authorizations_deactivation_check
    check (
      (is_active and deactivated_at is null and deactivated_by_profile_id is null and deactivation_reason is null)
      or (
        not is_active
        and deactivated_at is not null
        and deactivated_by_profile_id is not null
        and btrim(coalesce(deactivation_reason, '')) <> ''
      )
    ),
  constraint station_user_authorizations_updated_after_created_check
    check (updated_at >= created_at)
);

create index ix_station_user_authorizations_active
  on app.station_user_authorizations (organization_id, station_id, is_active);

create table app.user_pin_credentials (
  id uuid primary key,
  organization_id uuid not null,
  user_profile_id uuid not null,
  verifier text not null,
  verifier_version integer not null default 1,
  reset_required boolean not null default false,
  failed_attempt_count integer not null default 0,
  attempt_window_started_at timestamptz,
  blocked_until timestamptz,
  second_block_requires_reset boolean not null default false,
  last_success_at timestamptz,
  changed_at timestamptz not null default now(),
  changed_by_profile_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_pin_credentials_organization_id_id_unique unique (organization_id, id),
  constraint user_pin_credentials_user_unique unique (organization_id, user_profile_id),
  constraint user_pin_credentials_user_fk foreign key (organization_id, user_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint user_pin_credentials_changed_by_fk
    foreign key (organization_id, changed_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint user_pin_credentials_verifier_not_blank_check check (btrim(verifier) <> ''),
  constraint user_pin_credentials_verifier_version_check check (verifier_version > 0),
  constraint user_pin_credentials_failed_attempt_count_check check (failed_attempt_count >= 0),
  constraint user_pin_credentials_second_block_check
    check (not second_block_requires_reset or reset_required),
  constraint user_pin_credentials_updated_after_created_check check (updated_at >= created_at)
);

create table app.worker_requests (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  requested_by_profile_id uuid not null,
  requested_name text not null,
  requested_email text,
  requested_phone text,
  status app.worker_request_status not null default 'PENDING',
  requested_at timestamptz not null,
  review_due_at timestamptz not null,
  resolved_by_profile_id uuid,
  resolved_at timestamptz,
  resolution_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_requests_organization_plant_id_unique
    unique (organization_id, plant_id, id),
  constraint worker_requests_organization_id_id_unique unique (organization_id, id),
  constraint worker_requests_plant_fk foreign key (organization_id, plant_id)
    references app.plants (organization_id, id) on delete restrict,
  constraint worker_requests_requested_by_fk
    foreign key (organization_id, requested_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint worker_requests_resolved_by_fk
    foreign key (organization_id, resolved_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint worker_requests_name_not_blank_check check (btrim(requested_name) <> ''),
  constraint worker_requests_email_not_blank_check
    check (requested_email is null or btrim(requested_email) <> ''),
  constraint worker_requests_phone_not_blank_check
    check (requested_phone is null or btrim(requested_phone) <> ''),
  constraint worker_requests_due_at_check
    check (review_due_at = requested_at + interval '72 hours'),
  constraint worker_requests_resolution_check
    check (
      (
        status = 'PENDING'
        and resolved_by_profile_id is null
        and resolved_at is null
        and resolution_reason is null
      )
      or (
        status = 'APPROVED'
        and resolved_by_profile_id is not null
        and resolved_at is not null
      )
      or (
        status in ('REJECTED', 'MERGED')
        and resolved_by_profile_id is not null
        and resolved_at is not null
        and btrim(coalesce(resolution_reason, '')) <> ''
      )
    ),
  constraint worker_requests_updated_after_created_check check (updated_at >= created_at)
);

create index ix_worker_requests_pending_review
  on app.worker_requests (organization_id, review_due_at)
  where status = 'PENDING';
create index ix_worker_requests_plant_status
  on app.worker_requests (organization_id, plant_id, status, requested_at);

create table app.workers (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  source_request_id uuid not null,
  name text not null,
  email text,
  phone text,
  status app.worker_status not null default 'PROVISIONAL',
  status_changed_at timestamptz not null default now(),
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workers_organization_id_id_unique unique (organization_id, id),
  constraint workers_organization_source_id_unique
    unique (organization_id, source_request_id, id),
  constraint workers_source_request_unique unique (organization_id, source_request_id),
  constraint workers_plant_fk foreign key (organization_id, plant_id)
    references app.plants (organization_id, id) on delete restrict,
  constraint workers_source_request_fk
    foreign key (organization_id, plant_id, source_request_id)
    references app.worker_requests (organization_id, plant_id, id) on delete restrict,
  constraint workers_name_not_blank_check check (btrim(name) <> ''),
  constraint workers_email_not_blank_check check (email is null or btrim(email) <> ''),
  constraint workers_phone_not_blank_check check (phone is null or btrim(phone) <> ''),
  constraint workers_deactivation_check
    check ((is_active and deactivated_at is null) or (not is_active and deactivated_at is not null)),
  constraint workers_expired_remains_active_check
    check (status <> 'PROVISIONAL_VENCIDO' or is_active),
  constraint workers_rejected_is_inactive_check
    check (status <> 'RECHAZADO' or not is_active),
  constraint workers_updated_after_created_check check (updated_at >= created_at)
);

create index ix_workers_plant_status
  on app.workers (organization_id, plant_id, status, is_active);
create index ix_workers_name_search
  on app.workers (organization_id, lower(btrim(name)));

create table app.worker_merges (
  id uuid primary key,
  organization_id uuid not null,
  source_worker_id uuid not null,
  target_worker_id uuid not null,
  source_request_id uuid not null,
  merged_by_profile_id uuid not null,
  reason text not null,
  merged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint worker_merges_organization_id_id_unique unique (organization_id, id),
  constraint worker_merges_source_unique unique (organization_id, source_worker_id),
  constraint worker_merges_request_unique unique (organization_id, source_request_id),
  constraint worker_merges_source_fk
    foreign key (organization_id, source_request_id, source_worker_id)
    references app.workers (organization_id, source_request_id, id) on delete restrict,
  constraint worker_merges_target_fk foreign key (organization_id, target_worker_id)
    references app.workers (organization_id, id) on delete restrict,
  constraint worker_merges_merged_by_fk
    foreign key (organization_id, merged_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint worker_merges_distinct_workers_check
    check (source_worker_id <> target_worker_id),
  constraint worker_merges_reason_not_blank_check check (btrim(reason) <> '')
);

create index ix_worker_merges_target
  on app.worker_merges (organization_id, target_worker_id);

create function app.prevent_worker_merge_chain()
returns trigger
language plpgsql
set search_path = pg_catalog, app
as $$
begin
  if exists (
    select 1
    from app.worker_merges
    where organization_id = new.organization_id
      and source_worker_id = new.target_worker_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'worker merge target must be canonical';
  end if;

  if exists (
    select 1
    from app.worker_merges
    where organization_id = new.organization_id
      and target_worker_id = new.source_worker_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'worker merge source already has merged workers';
  end if;

  return new;
end;
$$;

revoke all on function app.prevent_worker_merge_chain() from public;
revoke all on function app.prevent_worker_merge_chain() from anon;
revoke all on function app.prevent_worker_merge_chain() from authenticated;
grant execute on function app.prevent_worker_merge_chain() to service_role;

create trigger trg_worker_merges_prevent_chain
before insert or update on app.worker_merges
for each row execute function app.prevent_worker_merge_chain();

create function app.reject_worker_merge_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'worker merge records are immutable';
end;
$$;

revoke all on function app.reject_worker_merge_mutation() from public;
revoke all on function app.reject_worker_merge_mutation() from anon;
revoke all on function app.reject_worker_merge_mutation() from authenticated;
grant execute on function app.reject_worker_merge_mutation() to service_role;

create trigger trg_worker_merges_immutable
before update or delete on app.worker_merges
for each row execute function app.reject_worker_merge_mutation();

create table app.suppliers (
  id uuid primary key,
  organization_id uuid not null,
  name text not null,
  email text,
  phone text,
  is_active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_organization_id_id_unique unique (organization_id, id),
  constraint suppliers_organization_fk foreign key (organization_id)
    references app.organizations (id) on delete restrict,
  constraint suppliers_name_not_blank_check check (btrim(name) <> ''),
  constraint suppliers_email_not_blank_check check (email is null or btrim(email) <> ''),
  constraint suppliers_phone_not_blank_check check (phone is null or btrim(phone) <> ''),
  constraint suppliers_deactivation_check
    check ((is_active and deactivated_at is null) or (not is_active and deactivated_at is not null)),
  constraint suppliers_updated_after_created_check check (updated_at >= created_at)
);

create unique index ux_suppliers_name_per_organization
  on app.suppliers (organization_id, lower(btrim(name)));
create index ix_suppliers_active_name
  on app.suppliers (organization_id, is_active, name);

create function app.assert_plant_manager_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, app
as $$
declare
  profile_role text;
  profile_status app.account_status;
  profile_active boolean;
begin
  select r.code, p.account_status, p.is_active
    into profile_role, profile_status, profile_active
  from app.user_profiles p
  join app.roles r on r.id = p.role_id
  where p.organization_id = new.organization_id
    and p.id = new.user_profile_id;

  if profile_role is distinct from 'JEFE_PLANTA'
     or profile_status is distinct from 'ACTIVE'
     or profile_active is distinct from true then
    raise exception using
      errcode = '23514',
      message = 'only an active plant manager can receive plant or station scope';
  end if;

  return new;
end;
$$;

revoke all on function app.assert_plant_manager_scope() from public;
revoke all on function app.assert_plant_manager_scope() from anon;
revoke all on function app.assert_plant_manager_scope() from authenticated;
grant execute on function app.assert_plant_manager_scope() to service_role;

create trigger trg_user_plant_scopes_assert_manager
before insert or update on app.user_plant_scopes
for each row execute function app.assert_plant_manager_scope();

create trigger trg_station_authorizations_assert_manager
before insert or update on app.station_user_authorizations
for each row execute function app.assert_plant_manager_scope();

create trigger trg_pin_credentials_assert_manager
before insert or update on app.user_pin_credentials
for each row execute function app.assert_plant_manager_scope();

create trigger trg_organizations_updated_at
before update on app.organizations
for each row execute function app.set_updated_at();
create trigger trg_plants_updated_at
before update on app.plants
for each row execute function app.set_updated_at();
create trigger trg_production_lines_updated_at
before update on app.production_lines
for each row execute function app.set_updated_at();
create trigger trg_line_component_types_updated_at
before update on app.line_component_types
for each row execute function app.set_updated_at();
create trigger trg_line_components_updated_at
before update on app.line_components
for each row execute function app.set_updated_at();
create trigger trg_stations_updated_at
before update on app.stations
for each row execute function app.set_updated_at();
create trigger trg_station_line_scopes_updated_at
before update on app.station_line_scopes
for each row execute function app.set_updated_at();
create trigger trg_roles_updated_at
before update on app.roles
for each row execute function app.set_updated_at();
create trigger trg_permissions_updated_at
before update on app.permissions
for each row execute function app.set_updated_at();
create trigger trg_user_profiles_updated_at
before update on app.user_profiles
for each row execute function app.set_updated_at();
create trigger trg_user_plant_scopes_updated_at
before update on app.user_plant_scopes
for each row execute function app.set_updated_at();
create trigger trg_station_user_authorizations_updated_at
before update on app.station_user_authorizations
for each row execute function app.set_updated_at();
create trigger trg_user_pin_credentials_updated_at
before update on app.user_pin_credentials
for each row execute function app.set_updated_at();
create trigger trg_worker_requests_updated_at
before update on app.worker_requests
for each row execute function app.set_updated_at();
create trigger trg_workers_updated_at
before update on app.workers
for each row execute function app.set_updated_at();
create trigger trg_suppliers_updated_at
before update on app.suppliers
for each row execute function app.set_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations',
    'plants',
    'production_lines',
    'line_component_types',
    'line_components',
    'stations',
    'station_line_scopes',
    'roles',
    'permissions',
    'role_permissions',
    'user_profiles',
    'user_plant_scopes',
    'station_user_authorizations',
    'user_pin_credentials',
    'worker_requests',
    'workers',
    'worker_merges',
    'suppliers'
  ]
  loop
    execute format('alter table app.%I enable row level security', table_name);
    execute format(
      'create policy backend_service_all on app.%I for all to service_role using (true) with check (true)',
      table_name
    );
  end loop;
end;
$$;

revoke all on all tables in schema app from public;
revoke all on all tables in schema app from anon;
revoke all on all tables in schema app from authenticated;
grant select, insert, update on all tables in schema app to service_role;

alter default privileges in schema app revoke all on tables from public;
alter default privileges in schema app revoke all on tables from anon;
alter default privileges in schema app revoke all on tables from authenticated;
alter default privileges in schema app grant select, insert, update on tables to service_role;

comment on schema app is
  'Datos de negocio de Industrias Doradas; acceso remoto exclusivo mediante NestJS.';
comment on table app.user_pin_credentials is
  'Solo verificadores versionados de PIN; nunca PIN claro, contrasena ni token.';
comment on table app.worker_merges is
  'Relacion inmutable origen-destino para conservar historial al fusionar duplicados.';
