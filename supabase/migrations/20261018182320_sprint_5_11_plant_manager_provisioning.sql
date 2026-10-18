-- Sprint 5.11: aprovisionamiento directo de jefes de planta desde gerencia.
-- La autenticacion se crea primero mediante Supabase Auth en el API; esta
-- funcion completa de forma atomica el perfil, alcance, estaciones y PIN.

create type app.account_provisioning_method as enum (
  'DIRECT',
  'EMAIL_INVITATION'
);

alter table app.user_profiles
  add column provisioning_method app.account_provisioning_method not null
    default 'DIRECT';

update app.user_profiles as profiles
set provisioning_method = 'EMAIL_INVITATION'
from app.roles
where roles.id = profiles.role_id
  and roles.code = 'ADMINISTRADOR';

comment on column app.user_profiles.provisioning_method is
  'Estrategia usada para entregar credenciales. EMAIL_INVITATION queda reservada para el flujo de autoactivacion futuro.';

create or replace function app.assert_plant_manager_scope()
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
     or profile_status not in ('PENDING_APPROVAL', 'ACTIVE')
     or profile_active is distinct from true then
    raise exception using
      errcode = '23514',
      message = 'only a pending or active plant manager can receive plant or station scope';
  end if;

  return new;
end;
$$;

revoke all on function app.assert_plant_manager_scope() from public, anon, authenticated;
grant execute on function app.assert_plant_manager_scope() to service_role;

create function app.provision_plant_manager(
  target_organization_id uuid,
  target_profile_id uuid,
  target_auth_user_id uuid,
  creator_profile_id uuid,
  target_display_name text,
  target_preferred_locale text,
  target_plant_id uuid,
  target_station_ids uuid[],
  target_authorization_ids uuid[],
  target_pin_credential_id uuid,
  target_pin_verifier text,
  provisioning_moment timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  creator_role text;
  station_count integer;
begin
  select roles.code
    into creator_role
  from app.user_profiles as profiles
  join app.roles as roles on roles.id = profiles.role_id
  where profiles.organization_id = target_organization_id
    and profiles.id = creator_profile_id
    and profiles.account_status = 'ACTIVE'
    and profiles.is_active
    and roles.is_active;

  if creator_role is distinct from 'JEFE_EMPRESA'
     or not app.profile_has_permission(
       target_organization_id,
       creator_profile_id,
       'plant_managers.manage'
     ) then
    raise exception using
      errcode = '42501',
      message = 'PLANT_MANAGER_PROVISION_NOT_AUTHORIZED';
  end if;

  if btrim(coalesce(target_display_name, '')) = ''
     or target_preferred_locale not in ('es', 'en')
     or btrim(coalesce(target_pin_verifier, '')) = '' then
    raise exception using
      errcode = '23514',
      message = 'PLANT_MANAGER_PROVISION_INVALID';
  end if;

  if not exists (
    select 1
    from app.plants
    where organization_id = target_organization_id
      and id = target_plant_id
      and is_active
  ) then
    raise exception using
      errcode = '23514',
      message = 'PLANT_MANAGER_ACTIVE_PLANT_REQUIRED';
  end if;

  if target_station_ids is null
     or target_authorization_ids is null
     or cardinality(target_station_ids) < 1
     or cardinality(target_station_ids) <> cardinality(target_authorization_ids)
     or exists (
       select station_id
       from unnest(target_station_ids) as requested(station_id)
       group by station_id
       having count(*) > 1
     ) then
    raise exception using
      errcode = '23514',
      message = 'PLANT_MANAGER_STATIONS_INVALID';
  end if;

  select count(*)
    into station_count
  from app.stations
  where organization_id = target_organization_id
    and plant_id = target_plant_id
    and id = any(target_station_ids)
    and is_active;

  if station_count <> cardinality(target_station_ids) then
    raise exception using
      errcode = '23514',
      message = 'PLANT_MANAGER_ACTIVE_STATIONS_REQUIRED';
  end if;

  insert into app.user_profiles (
    id,
    organization_id,
    auth_user_id,
    role_id,
    display_name,
    preferred_locale,
    account_status,
    provisioning_method,
    created_at,
    updated_at
  )
  select
    target_profile_id,
    target_organization_id,
    target_auth_user_id,
    roles.id,
    btrim(target_display_name),
    target_preferred_locale,
    'PENDING_APPROVAL',
    'DIRECT',
    provisioning_moment,
    provisioning_moment
  from app.roles
  where roles.code = 'JEFE_PLANTA'
    and roles.is_active;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'PLANT_MANAGER_ROLE_NOT_FOUND';
  end if;

  insert into app.user_plant_scopes (
    organization_id,
    user_profile_id,
    plant_id,
    created_at,
    updated_at
  ) values (
    target_organization_id,
    target_profile_id,
    target_plant_id,
    provisioning_moment,
    provisioning_moment
  );

  insert into app.station_user_authorizations (
    id,
    organization_id,
    plant_id,
    station_id,
    user_profile_id,
    authorized_by_profile_id,
    authorized_at,
    created_at,
    updated_at
  )
  select
    requested.authorization_id,
    target_organization_id,
    target_plant_id,
    requested.station_id,
    target_profile_id,
    creator_profile_id,
    provisioning_moment,
    provisioning_moment,
    provisioning_moment
  from unnest(target_station_ids, target_authorization_ids)
    as requested(station_id, authorization_id);

  insert into app.user_pin_credentials (
    id,
    organization_id,
    user_profile_id,
    verifier,
    verifier_version,
    changed_by_profile_id,
    changed_at,
    created_at,
    updated_at
  ) values (
    target_pin_credential_id,
    target_organization_id,
    target_profile_id,
    target_pin_verifier,
    1,
    creator_profile_id,
    provisioning_moment,
    provisioning_moment,
    provisioning_moment
  );

  return target_profile_id;
end;
$$;

revoke all on function app.provision_plant_manager(
  uuid, uuid, uuid, uuid, text, text, uuid, uuid[], uuid[], uuid, text,
  timestamptz
) from public, anon, authenticated;
grant execute on function app.provision_plant_manager(
  uuid, uuid, uuid, uuid, text, text, uuid, uuid[], uuid[], uuid, text,
  timestamptz
) to service_role;

create or replace function app.govern_account(
  target_organization_id uuid,
  target_profile_id uuid,
  governor_profile_id uuid,
  governance_action text,
  governance_reason text,
  governance_moment timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  target_role text;
  target_status app.account_status;
  required_permission text;
begin
  if target_profile_id = governor_profile_id then
    raise exception using errcode = '23514', message = 'ACCOUNT_SELF_GOVERNANCE_FORBIDDEN';
  end if;

  select roles.code, profiles.account_status
    into target_role, target_status
  from app.user_profiles as profiles
  join app.roles as roles on roles.id = profiles.role_id
  where profiles.organization_id = target_organization_id
    and profiles.id = target_profile_id
    and profiles.is_active
  for update of profiles;

  if target_role is null then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_PROFILE_NOT_FOUND';
  end if;

  if target_role = 'ADMINISTRADOR' then
    required_permission := 'administrators.govern';
  elsif target_role = 'JEFE_PLANTA' then
    required_permission := 'plant_managers.manage';
  else
    raise exception using errcode = '42501', message = 'COMPANY_MANAGER_GOVERNANCE_FORBIDDEN';
  end if;

  if not app.profile_has_permission(
    target_organization_id,
    governor_profile_id,
    required_permission
  ) then
    raise exception using errcode = '42501', message = 'ACCOUNT_GOVERNANCE_NOT_AUTHORIZED';
  end if;

  if target_role = 'JEFE_PLANTA'
     and governance_action in ('APPROVE', 'REACTIVATE')
     and not (
       exists (
         select 1
         from app.user_plant_scopes as scopes
         join app.plants as plants
           on plants.organization_id = scopes.organization_id
          and plants.id = scopes.plant_id
          and plants.is_active
         where scopes.organization_id = target_organization_id
           and scopes.user_profile_id = target_profile_id
           and scopes.is_active
       )
       and exists (
         select 1
         from app.station_user_authorizations as authorizations
         join app.stations as stations
           on stations.organization_id = authorizations.organization_id
          and stations.plant_id = authorizations.plant_id
          and stations.id = authorizations.station_id
          and stations.is_active
         where authorizations.organization_id = target_organization_id
           and authorizations.user_profile_id = target_profile_id
           and authorizations.is_active
       )
       and exists (
         select 1
         from app.user_pin_credentials
         where organization_id = target_organization_id
           and user_profile_id = target_profile_id
           and not reset_required
       )
     ) then
    raise exception using
      errcode = '23514',
      message = 'PLANT_MANAGER_SETUP_INCOMPLETE';
  end if;

  case governance_action
    when 'APPROVE' then
      if target_status <> 'PENDING_APPROVAL' then
        raise exception using errcode = '23514', message = 'ACCOUNT_NOT_PENDING_APPROVAL';
      end if;
      update app.user_profiles
      set account_status = 'ACTIVE', approved_by_profile_id = governor_profile_id,
          approved_at = governance_moment, suspended_by_profile_id = null,
          suspended_at = null, status_reason = null
      where organization_id = target_organization_id and id = target_profile_id;
    when 'SUSPEND' then
      if target_status <> 'ACTIVE' then
        raise exception using errcode = '23514', message = 'ACCOUNT_NOT_ACTIVE';
      end if;
      if btrim(coalesce(governance_reason, '')) = '' then
        raise exception using errcode = '23514', message = 'GOVERNANCE_REASON_REQUIRED';
      end if;
      update app.user_profiles
      set account_status = 'SUSPENDED', suspended_by_profile_id = governor_profile_id,
          suspended_at = governance_moment, status_reason = btrim(governance_reason)
      where organization_id = target_organization_id and id = target_profile_id;
    when 'REACTIVATE' then
      if target_status <> 'SUSPENDED' then
        raise exception using errcode = '23514', message = 'ACCOUNT_NOT_SUSPENDED';
      end if;
      update app.user_profiles
      set account_status = 'ACTIVE', suspended_by_profile_id = null,
          suspended_at = null, status_reason = null
      where organization_id = target_organization_id and id = target_profile_id;
    else
      raise exception using errcode = '22023', message = 'ACCOUNT_GOVERNANCE_ACTION_INVALID';
  end case;

  return target_profile_id;
end;
$$;

comment on function app.provision_plant_manager(
  uuid, uuid, uuid, uuid, text, text, uuid, uuid[], uuid[], uuid, text,
  timestamptz
) is
  'Aprovisiona atomicamente un JEFE_PLANTA pendiente con planta, estaciones y verificador PIN; solo service_role puede invocarla.';
