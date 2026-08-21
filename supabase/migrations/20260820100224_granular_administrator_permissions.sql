-- Autorizacion granular de administradores y cuenta gerencial unificada.
-- Version aplicada en Supabase de desarrollo: 20260820100224.
-- JEFE_EMPRESA recibe todos los permisos activos; ADMINISTRADOR solo conserva
-- permisos base de rol y concesiones individuales vigentes.

create table app.user_permission_grants (
  id uuid primary key,
  organization_id uuid not null,
  user_profile_id uuid not null,
  permission_id uuid not null,
  granted_by_profile_id uuid not null,
  granted_at timestamptz not null,
  revoked_by_profile_id uuid,
  revoked_at timestamptz,
  constraint user_permission_grants_user_fk
    foreign key (organization_id, user_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint user_permission_grants_permission_fk
    foreign key (permission_id)
    references app.permissions (id) on delete restrict,
  constraint user_permission_grants_grantor_fk
    foreign key (organization_id, granted_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint user_permission_grants_revoker_fk
    foreign key (organization_id, revoked_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint user_permission_grants_revocation_pair_check
    check ((revoked_by_profile_id is null) = (revoked_at is null)),
  constraint user_permission_grants_revoked_after_granted_check
    check (revoked_at is null or revoked_at >= granted_at)
);

create unique index ux_user_permission_grants_active
  on app.user_permission_grants (organization_id, user_profile_id, permission_id)
  where revoked_at is null;

create index ix_user_permission_grants_profile
  on app.user_permission_grants (organization_id, user_profile_id, revoked_at, permission_id);

create index ix_user_permission_grants_permission
  on app.user_permission_grants (permission_id, organization_id, revoked_at);

create index ix_user_permission_grants_grantor
  on app.user_permission_grants (organization_id, granted_by_profile_id);

create index ix_user_permission_grants_revoker
  on app.user_permission_grants (organization_id, revoked_by_profile_id);

alter table app.user_permission_grants enable row level security;
revoke all on table app.user_permission_grants from public, anon, authenticated;
grant select, insert, update on table app.user_permission_grants to service_role;

insert into app.permissions (id, code, description)
values
  ('10000000-0000-4000-8000-000000000022', 'administrators.create', 'Crear e invitar cuentas administrativas con permisos limitados.'),
  ('10000000-0000-4000-8000-000000000023', 'administrators.permissions.manage', 'Asignar o retirar permisos a cuentas administrativas.'),
  ('10000000-0000-4000-8000-000000000024', 'workers.read', 'Consultar trabajadores y solicitudes de trabajadores.')
on conflict (id) do update
set
  code = excluded.code,
  description = excluded.description,
  is_active = true;

-- Conserva el acceso efectivo de los administradores que ya existian al
-- aplicar esta migracion. Las cuentas nuevas no reciben estas concesiones.
insert into app.user_permission_grants (
  id,
  organization_id,
  user_profile_id,
  permission_id,
  granted_by_profile_id,
  granted_at
)
select
  gen_random_uuid(),
  profiles.organization_id,
  profiles.id,
  assignments.permission_id,
  coalesce(managers.id, profiles.id),
  now()
from app.user_profiles as profiles
join app.roles as administrator_role
  on administrator_role.id = profiles.role_id
 and administrator_role.code = 'ADMINISTRADOR'
join app.role_permissions as assignments
  on assignments.role_id = administrator_role.id
join app.permissions as permissions
  on permissions.id = assignments.permission_id
left join lateral (
  select manager_profiles.id
  from app.user_profiles as manager_profiles
  join app.roles as manager_role
    on manager_role.id = manager_profiles.role_id
   and manager_role.code = 'JEFE_EMPRESA'
  where manager_profiles.organization_id = profiles.organization_id
    and manager_profiles.account_status = 'ACTIVE'
    and manager_profiles.is_active
  order by manager_profiles.created_at, manager_profiles.id
  limit 1
) as managers on true
where permissions.code <> 'profile.locale_update'
on conflict (organization_id, user_profile_id, permission_id)
  where revoked_at is null
do nothing;

insert into app.user_permission_grants (
  id,
  organization_id,
  user_profile_id,
  permission_id,
  granted_by_profile_id,
  granted_at
)
select
  gen_random_uuid(),
  profiles.organization_id,
  profiles.id,
  permissions.id,
  coalesce(managers.id, profiles.id),
  now()
from app.user_profiles as profiles
join app.roles as administrator_role
  on administrator_role.id = profiles.role_id
 and administrator_role.code = 'ADMINISTRADOR'
join app.permissions as permissions on permissions.code = 'workers.read'
left join lateral (
  select manager_profiles.id
  from app.user_profiles as manager_profiles
  join app.roles as manager_role
    on manager_role.id = manager_profiles.role_id
   and manager_role.code = 'JEFE_EMPRESA'
  where manager_profiles.organization_id = profiles.organization_id
    and manager_profiles.account_status = 'ACTIVE'
    and manager_profiles.is_active
  order by manager_profiles.created_at, manager_profiles.id
  limit 1
) as managers on true
on conflict (organization_id, user_profile_id, permission_id)
  where revoked_at is null
do nothing;

create function app.enforce_user_permission_grant_history()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  target_role text;
begin
  if tg_op = 'INSERT' then
    select roles.code into target_role
    from app.user_profiles as profiles
    join app.roles as roles on roles.id = profiles.role_id
    where profiles.organization_id = new.organization_id
      and profiles.id = new.user_profile_id;
    if target_role <> 'ADMINISTRADOR' then
      raise exception using errcode = '23514', message = 'PERMISSION_GRANT_TARGET_MUST_BE_ADMINISTRATOR';
    end if;
    return new;
  end if;

  if old.revoked_at is not null
     or new.id <> old.id
     or new.organization_id <> old.organization_id
     or new.user_profile_id <> old.user_profile_id
     or new.permission_id <> old.permission_id
     or new.granted_by_profile_id <> old.granted_by_profile_id
     or new.granted_at <> old.granted_at
     or new.revoked_at is null
     or new.revoked_by_profile_id is null then
    raise exception using errcode = '23514', message = 'PERMISSION_GRANT_HISTORY_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger trg_user_permission_grant_history
before insert or update on app.user_permission_grants
for each row execute function app.enforce_user_permission_grant_history();

-- ADMINISTRADOR conserva unicamente capacidades base no delegables del perfil.
delete from app.role_permissions as assignments
using app.roles as roles, app.permissions as permissions
where assignments.role_id = roles.id
  and assignments.permission_id = permissions.id
  and roles.code = 'ADMINISTRADOR'
  and permissions.code <> 'profile.locale_update';

create or replace function app.profile_has_permission(
  target_organization_id uuid,
  target_profile_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from app.user_profiles as profiles
    join app.roles as roles
      on roles.id = profiles.role_id
    join app.permissions as permissions
      on permissions.code = target_permission_code
     and permissions.is_active
    where profiles.organization_id = target_organization_id
      and profiles.id = target_profile_id
      and profiles.account_status = 'ACTIVE'
      and profiles.is_active
      and roles.is_active
      and (
        roles.code = 'JEFE_EMPRESA'
        or exists (
          select 1
          from app.role_permissions as role_grants
          where role_grants.role_id = roles.id
            and role_grants.permission_id = permissions.id
        )
        or (
          roles.code = 'ADMINISTRADOR'
          and exists (
            select 1
            from app.user_permission_grants as user_grants
            where user_grants.organization_id = profiles.organization_id
              and user_grants.user_profile_id = profiles.id
              and user_grants.permission_id = permissions.id
              and user_grants.revoked_at is null
          )
        )
      )
  );
$$;

create function app.replace_administrator_permissions(
  target_organization_id uuid,
  target_profile_id uuid,
  governor_profile_id uuid,
  desired_permission_codes text[],
  new_grant_ids uuid[],
  change_moment timestamptz
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  governor_role text;
  target_role text;
begin
  if target_profile_id = governor_profile_id then
    raise exception using errcode = '23514', message = 'ACCOUNT_SELF_PERMISSION_CHANGE_FORBIDDEN';
  end if;

  if cardinality(desired_permission_codes) <> cardinality(new_grant_ids) then
    raise exception using errcode = '22023', message = 'PERMISSION_GRANT_IDS_MISMATCH';
  end if;

  if exists (
    select codes.code
    from unnest(desired_permission_codes) as codes(code)
    group by codes.code
    having count(*) > 1
  ) then
    raise exception using errcode = '23514', message = 'PERMISSION_CODES_DUPLICATED';
  end if;

  select roles.code
    into governor_role
  from app.user_profiles as profiles
  join app.roles as roles on roles.id = profiles.role_id
  where profiles.organization_id = target_organization_id
    and profiles.id = governor_profile_id
    and profiles.account_status = 'ACTIVE'
    and profiles.is_active
    and roles.is_active;

  select roles.code
    into target_role
  from app.user_profiles as profiles
  join app.roles as roles on roles.id = profiles.role_id
  where profiles.organization_id = target_organization_id
    and profiles.id = target_profile_id
    and profiles.is_active
  for update of profiles;

  if target_role is null then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_PROFILE_NOT_FOUND';
  end if;
  if target_role <> 'ADMINISTRADOR' then
    raise exception using errcode = '42501', message = 'PERMISSIONS_TARGET_MUST_BE_ADMINISTRATOR';
  end if;
  if governor_role not in ('JEFE_EMPRESA', 'ADMINISTRADOR')
     or not (
       app.profile_has_permission(
         target_organization_id,
         governor_profile_id,
         'administrators.permissions.manage'
       )
       or app.profile_has_permission(
         target_organization_id,
         governor_profile_id,
         'administrators.create'
       )
     ) then
    raise exception using errcode = '42501', message = 'ADMINISTRATOR_PERMISSION_CHANGE_NOT_AUTHORIZED';
  end if;

  if exists (
    select 1
    from unnest(desired_permission_codes) as desired(code)
    left join app.permissions as permissions
      on permissions.code = desired.code
     and permissions.is_active
    where permissions.id is null
  ) then
    raise exception using errcode = '22023', message = 'PERMISSION_CODE_INVALID';
  end if;

  -- Un administrador solo puede cambiar permisos que el mismo posee. Se
  -- compara la diferencia entre estado actual y deseado para no obligarlo a
  -- administrar concesiones ajenas que debe conservar.
  if governor_role = 'ADMINISTRADOR' and exists (
    select changed.code
    from ((
      select permissions.code
      from app.user_permission_grants as grants
      join app.permissions as permissions on permissions.id = grants.permission_id
      where grants.organization_id = target_organization_id
        and grants.user_profile_id = target_profile_id
        and grants.revoked_at is null
      except
      select desired.code from unnest(desired_permission_codes) as desired(code)
    ) union (
      select desired.code from unnest(desired_permission_codes) as desired(code)
      except
      select permissions.code
      from app.user_permission_grants as grants
      join app.permissions as permissions on permissions.id = grants.permission_id
      where grants.organization_id = target_organization_id
        and grants.user_profile_id = target_profile_id
        and grants.revoked_at is null
    )) as changed
    where not app.profile_has_permission(
      target_organization_id,
      governor_profile_id,
      changed.code
    )
  ) then
    raise exception using errcode = '42501', message = 'PERMISSION_DELEGATION_EXCEEDS_GOVERNOR';
  end if;

  update app.user_permission_grants as grants
  set
    revoked_by_profile_id = governor_profile_id,
    revoked_at = change_moment
  where grants.organization_id = target_organization_id
    and grants.user_profile_id = target_profile_id
    and grants.revoked_at is null
    and not exists (
      select 1
      from unnest(desired_permission_codes) as desired(code)
      join app.permissions as permissions on permissions.code = desired.code
      where permissions.id = grants.permission_id
    );

  insert into app.user_permission_grants (
    id,
    organization_id,
    user_profile_id,
    permission_id,
    granted_by_profile_id,
    granted_at
  )
  select
    desired.id,
    target_organization_id,
    target_profile_id,
    permissions.id,
    governor_profile_id,
    change_moment
  from unnest(desired_permission_codes, new_grant_ids) as desired(code, id)
  join app.permissions as permissions
    on permissions.code = desired.code
   and permissions.is_active
  where not exists (
    select 1
    from app.user_permission_grants as current_grants
    where current_grants.organization_id = target_organization_id
      and current_grants.user_profile_id = target_profile_id
      and current_grants.permission_id = permissions.id
      and current_grants.revoked_at is null
  );
end;
$$;

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

revoke all on function app.replace_administrator_permissions(uuid, uuid, uuid, text[], uuid[], timestamptz)
  from public, anon, authenticated;
revoke all on function app.enforce_user_permission_grant_history()
  from public, anon, authenticated;
grant execute on function app.replace_administrator_permissions(uuid, uuid, uuid, text[], uuid[], timestamptz)
  to service_role;

comment on table app.user_permission_grants is
  'Concesiones individuales auditables para ADMINISTRADOR; las revocaciones no se borran.';
