-- Flujos transaccionales del Sprint 1.6. Las funciones son exclusivas del
-- backend y conservan las reglas aprobadas en PostgreSQL.
-- Version aplicada en Supabase de desarrollo: 20260819063818.

create function app.profile_has_permission(
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
    join app.role_permissions as assignments
      on assignments.role_id = roles.id
    join app.permissions as permissions
      on permissions.id = assignments.permission_id
    where profiles.organization_id = target_organization_id
      and profiles.id = target_profile_id
      and profiles.account_status = 'ACTIVE'
      and profiles.is_active
      and roles.is_active
      and permissions.is_active
      and permissions.code = target_permission_code
  );
$$;

create function app.request_worker(
  new_request_id uuid,
  new_worker_id uuid,
  target_organization_id uuid,
  target_plant_id uuid,
  requester_profile_id uuid,
  worker_name text,
  worker_email text,
  worker_phone text,
  requested_moment timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if not app.profile_has_permission(
    target_organization_id,
    requester_profile_id,
    'workers.request'
  ) then
    raise exception using
      errcode = '42501',
      message = 'WORKER_REQUEST_NOT_AUTHORIZED';
  end if;

  insert into app.worker_requests (
    id,
    organization_id,
    plant_id,
    requested_by_profile_id,
    requested_name,
    requested_email,
    requested_phone,
    requested_at,
    review_due_at
  ) values (
    new_request_id,
    target_organization_id,
    target_plant_id,
    requester_profile_id,
    btrim(worker_name),
    nullif(btrim(worker_email), ''),
    nullif(btrim(worker_phone), ''),
    requested_moment,
    requested_moment + interval '72 hours'
  );

  insert into app.workers (
    id,
    organization_id,
    plant_id,
    source_request_id,
    name,
    email,
    phone,
    status,
    status_changed_at
  ) values (
    new_worker_id,
    target_organization_id,
    target_plant_id,
    new_request_id,
    btrim(worker_name),
    nullif(btrim(worker_email), ''),
    nullif(btrim(worker_phone), ''),
    'PROVISIONAL',
    requested_moment
  );

  return new_worker_id;
end;
$$;

create function app.expire_provisional_workers(
  target_organization_id uuid,
  observed_at timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  affected_count integer;
begin
  update app.workers as workers
  set
    status = 'PROVISIONAL_VENCIDO',
    status_changed_at = observed_at
  from app.worker_requests as requests
  where workers.organization_id = target_organization_id
    and workers.organization_id = requests.organization_id
    and workers.source_request_id = requests.id
    and workers.status = 'PROVISIONAL'
    and workers.is_active
    and requests.status = 'PENDING'
    and requests.review_due_at <= observed_at;

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

create function app.resolve_worker_request(
  target_organization_id uuid,
  target_request_id uuid,
  resolver_profile_id uuid,
  resolution_action text,
  resolution_reason text,
  canonical_worker_id uuid,
  resolution_moment timestamptz,
  new_merge_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  request_record app.worker_requests%rowtype;
  worker_record app.workers%rowtype;
begin
  if not app.profile_has_permission(
    target_organization_id,
    resolver_profile_id,
    'workers.resolve'
  ) then
    raise exception using
      errcode = '42501',
      message = 'WORKER_RESOLUTION_NOT_AUTHORIZED';
  end if;

  select *
    into request_record
  from app.worker_requests
  where organization_id = target_organization_id
    and id = target_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'WORKER_REQUEST_NOT_FOUND';
  end if;

  if request_record.status <> 'PENDING' then
    raise exception using errcode = '23514', message = 'WORKER_REQUEST_ALREADY_RESOLVED';
  end if;

  select *
    into worker_record
  from app.workers
  where organization_id = target_organization_id
    and source_request_id = target_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PROVISIONAL_WORKER_NOT_FOUND';
  end if;

  case resolution_action
    when 'APPROVE' then
      update app.worker_requests
      set
        status = 'APPROVED',
        resolved_by_profile_id = resolver_profile_id,
        resolved_at = resolution_moment,
        resolution_reason = null
      where id = request_record.id;

      update app.workers
      set
        status = 'ACTIVO',
        status_changed_at = resolution_moment,
        is_active = true,
        deactivated_at = null
      where id = worker_record.id;

    when 'REJECT' then
      if btrim(coalesce(resolution_reason, '')) = '' then
        raise exception using errcode = '23514', message = 'RESOLUTION_REASON_REQUIRED';
      end if;

      update app.worker_requests
      set
        status = 'REJECTED',
        resolved_by_profile_id = resolver_profile_id,
        resolved_at = resolution_moment,
        resolution_reason = btrim(resolution_reason)
      where id = request_record.id;

      update app.workers
      set
        status = 'RECHAZADO',
        status_changed_at = resolution_moment,
        is_active = false,
        deactivated_at = resolution_moment
      where id = worker_record.id;

    when 'MERGE' then
      if btrim(coalesce(resolution_reason, '')) = '' then
        raise exception using errcode = '23514', message = 'RESOLUTION_REASON_REQUIRED';
      end if;

      if canonical_worker_id is null or canonical_worker_id = worker_record.id then
        raise exception using errcode = '23514', message = 'CANONICAL_WORKER_REQUIRED';
      end if;

      if not exists (
        select 1
        from app.workers as canonical
        where canonical.organization_id = target_organization_id
          and canonical.id = canonical_worker_id
          and canonical.is_active
          and canonical.status <> 'RECHAZADO'
      ) then
        raise exception using errcode = '23514', message = 'CANONICAL_WORKER_INVALID';
      end if;

      insert into app.worker_merges (
        id,
        organization_id,
        source_worker_id,
        target_worker_id,
        source_request_id,
        merged_by_profile_id,
        reason,
        merged_at
      ) values (
        new_merge_id,
        target_organization_id,
        worker_record.id,
        canonical_worker_id,
        request_record.id,
        resolver_profile_id,
        btrim(resolution_reason),
        resolution_moment
      );

      update app.worker_requests
      set
        status = 'MERGED',
        resolved_by_profile_id = resolver_profile_id,
        resolved_at = resolution_moment,
        resolution_reason = btrim(resolution_reason)
      where id = request_record.id;

      update app.workers
      set
        status = 'RECHAZADO',
        status_changed_at = resolution_moment,
        is_active = false,
        deactivated_at = resolution_moment
      where id = worker_record.id;

    else
      raise exception using errcode = '22023', message = 'WORKER_RESOLUTION_ACTION_INVALID';
  end case;

  return worker_record.id;
end;
$$;

create function app.govern_account(
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
  governor_role text;
  target_role text;
  target_status app.account_status;
begin
  if target_profile_id = governor_profile_id then
    raise exception using errcode = '23514', message = 'ACCOUNT_SELF_GOVERNANCE_FORBIDDEN';
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
    if governor_role <> 'JEFE_EMPRESA'
       or not app.profile_has_permission(
         target_organization_id,
         governor_profile_id,
         'administrators.govern'
       ) then
      raise exception using errcode = '42501', message = 'ADMINISTRATOR_GOVERNANCE_NOT_AUTHORIZED';
    end if;
  elsif target_role = 'JEFE_PLANTA' then
    if governor_role <> 'ADMINISTRADOR'
       or not app.profile_has_permission(
         target_organization_id,
         governor_profile_id,
         'plant_managers.manage'
       ) then
      raise exception using errcode = '42501', message = 'PLANT_MANAGER_GOVERNANCE_NOT_AUTHORIZED';
    end if;
  else
    raise exception using errcode = '42501', message = 'COMPANY_MANAGER_GOVERNANCE_FORBIDDEN';
  end if;

  case governance_action
    when 'APPROVE' then
      if target_status <> 'PENDING_APPROVAL' then
        raise exception using errcode = '23514', message = 'ACCOUNT_NOT_PENDING_APPROVAL';
      end if;

      update app.user_profiles
      set
        account_status = 'ACTIVE',
        approved_by_profile_id = governor_profile_id,
        approved_at = governance_moment,
        suspended_by_profile_id = null,
        suspended_at = null,
        status_reason = null
      where organization_id = target_organization_id
        and id = target_profile_id;

    when 'SUSPEND' then
      if target_status <> 'ACTIVE' then
        raise exception using errcode = '23514', message = 'ACCOUNT_NOT_ACTIVE';
      end if;
      if btrim(coalesce(governance_reason, '')) = '' then
        raise exception using errcode = '23514', message = 'GOVERNANCE_REASON_REQUIRED';
      end if;

      update app.user_profiles
      set
        account_status = 'SUSPENDED',
        suspended_by_profile_id = governor_profile_id,
        suspended_at = governance_moment,
        status_reason = btrim(governance_reason)
      where organization_id = target_organization_id
        and id = target_profile_id;

    when 'REACTIVATE' then
      if target_status <> 'SUSPENDED' then
        raise exception using errcode = '23514', message = 'ACCOUNT_NOT_SUSPENDED';
      end if;

      update app.user_profiles
      set
        account_status = 'ACTIVE',
        suspended_by_profile_id = null,
        suspended_at = null,
        status_reason = null
      where organization_id = target_organization_id
        and id = target_profile_id;

    else
      raise exception using errcode = '22023', message = 'ACCOUNT_GOVERNANCE_ACTION_INVALID';
  end case;

  return target_profile_id;
end;
$$;

revoke all on function app.profile_has_permission(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app.request_worker(uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function app.expire_provisional_workers(uuid, timestamptz) from public, anon, authenticated;
revoke all on function app.resolve_worker_request(uuid, uuid, uuid, text, text, uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function app.govern_account(uuid, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;

grant execute on function app.profile_has_permission(uuid, uuid, text) to service_role;
grant execute on function app.request_worker(uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz) to service_role;
grant execute on function app.expire_provisional_workers(uuid, timestamptz) to service_role;
grant execute on function app.resolve_worker_request(uuid, uuid, uuid, text, text, uuid, timestamptz, uuid) to service_role;
grant execute on function app.govern_account(uuid, uuid, uuid, text, text, timestamptz) to service_role;
