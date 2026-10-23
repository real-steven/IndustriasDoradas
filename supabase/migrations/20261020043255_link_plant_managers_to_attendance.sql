-- Sprint 6.5: todos los jefes de planta también son participantes de asistencia.
-- La identidad laboral permanece separada de Auth, contraseña y PIN.

alter table app.workers
  add column user_profile_id uuid;

alter table app.workers
  add constraint workers_user_profile_fk
  foreign key (organization_id, user_profile_id)
  references app.user_profiles (organization_id, id) on delete restrict;

create unique index ux_workers_user_profile
  on app.workers (organization_id, user_profile_id);

comment on column app.workers.user_profile_id is
  'Vínculo opcional con la cuenta de un JEFE_PLANTA. Operarios sin credenciales conservan NULL.';

create function app.ensure_plant_manager_worker_v1(
  target_organization_id uuid,
  target_profile_id uuid,
  target_plant_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  profile_record record;
  existing_worker_id uuid;
  new_request_id uuid := gen_random_uuid();
  new_worker_id uuid := gen_random_uuid();
  recorded_at timestamptz;
begin
  select
    profiles.display_name,
    profiles.created_at,
    profiles.approved_at
  into profile_record
  from app.user_profiles as profiles
  join app.roles as roles on roles.id = profiles.role_id
  where profiles.organization_id = target_organization_id
    and profiles.id = target_profile_id
    and profiles.is_active
    and roles.code = 'JEFE_PLANTA';

  if not found then
    return null;
  end if;

  select workers.id
  into existing_worker_id
  from app.workers as workers
  where workers.organization_id = target_organization_id
    and workers.user_profile_id = target_profile_id;

  if existing_worker_id is not null then
    return existing_worker_id;
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

  recorded_at := coalesce(profile_record.approved_at, profile_record.created_at, now());

  insert into app.worker_requests (
    id,
    organization_id,
    plant_id,
    requested_by_profile_id,
    requested_name,
    status,
    requested_at,
    review_due_at,
    resolved_by_profile_id,
    resolved_at,
    created_at,
    updated_at
  ) values (
    new_request_id,
    target_organization_id,
    target_plant_id,
    target_profile_id,
    profile_record.display_name,
    'APPROVED',
    recorded_at,
    recorded_at + interval '72 hours',
    target_profile_id,
    recorded_at,
    recorded_at,
    recorded_at
  );

  insert into app.workers (
    id,
    organization_id,
    plant_id,
    source_request_id,
    user_profile_id,
    name,
    status,
    status_changed_at,
    created_at,
    updated_at
  ) values (
    new_worker_id,
    target_organization_id,
    target_plant_id,
    new_request_id,
    target_profile_id,
    profile_record.display_name,
    'ACTIVO',
    recorded_at,
    recorded_at,
    recorded_at
  );

  return new_worker_id;
exception
  when unique_violation then
    select workers.id
    into existing_worker_id
    from app.workers as workers
    where workers.organization_id = target_organization_id
      and workers.user_profile_id = target_profile_id;

    if existing_worker_id is null then
      raise;
    end if;
    return existing_worker_id;
end;
$$;

revoke all on function app.ensure_plant_manager_worker_v1(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function app.ensure_plant_manager_worker_v1(uuid, uuid, uuid)
  to service_role;

create function app.link_plant_manager_worker_from_scope_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.is_active then
    perform app.ensure_plant_manager_worker_v1(
      new.organization_id,
      new.user_profile_id,
      new.plant_id
    );
  end if;
  return new;
end;
$$;

revoke all on function app.link_plant_manager_worker_from_scope_v1()
  from public, anon, authenticated;

create trigger trg_user_plant_scope_link_worker
after insert or update of is_active on app.user_plant_scopes
for each row execute function app.link_plant_manager_worker_from_scope_v1();

do $$
declare
  manager_scope record;
begin
  for manager_scope in
    select distinct on (scopes.organization_id, scopes.user_profile_id)
      scopes.organization_id,
      scopes.user_profile_id,
      scopes.plant_id
    from app.user_plant_scopes as scopes
    join app.user_profiles as profiles
      on profiles.organization_id = scopes.organization_id
     and profiles.id = scopes.user_profile_id
    join app.roles on roles.id = profiles.role_id
    where scopes.is_active
      and profiles.is_active
      and roles.code = 'JEFE_PLANTA'
    order by scopes.organization_id, scopes.user_profile_id, scopes.created_at, scopes.plant_id
  loop
    perform app.ensure_plant_manager_worker_v1(
      manager_scope.organization_id,
      manager_scope.user_profile_id,
      manager_scope.plant_id
    );
  end loop;
end;
$$;

-- Una solicitud de operario queda pendiente hasta una decisión explícita.
-- La función se conserva como compatibilidad para clientes anteriores, pero ya
-- no materializa PROVISIONAL_VENCIDO ni altera fichas laborales.
create or replace function app.expire_provisional_workers(
  target_organization_id uuid,
  observed_at timestamptz
)
returns integer
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select 0;
$$;

comment on function app.expire_provisional_workers(uuid, timestamptz) is
  'Compatibilidad: las solicitudes pendientes ya no vencen automáticamente.';

revoke all on function app.expire_provisional_workers(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function app.expire_provisional_workers(uuid, timestamptz)
  to service_role;
