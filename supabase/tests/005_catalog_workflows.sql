-- Prueba de flujos transaccionales y gobierno del Sprint 1.6.

select app.request_worker(
  'c0000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'Trabajador solicitado ficticio',
  '',
  '',
  '2026-01-10T00:00:00Z'
);

do $$
declare
  actual_count integer;
begin
  select count(*) into actual_count
  from app.worker_requests
  where id = 'c0000000-0000-4000-8000-000000000001'
    and status = 'PENDING'
    and review_due_at = '2026-01-13T00:00:00Z';

  if actual_count <> 1 then
    raise exception 'request_worker must create a pending 72-hour request';
  end if;

  select count(*) into actual_count
  from app.workers
  where id = 'c1000000-0000-4000-8000-000000000001'
    and status = 'PROVISIONAL'
    and is_active
    and email is null
    and phone is null;

  if actual_count <> 1 then
    raise exception 'request_worker must atomically create the provisional worker';
  end if;

  begin
    perform app.request_worker(
      'c0000000-0000-4000-8000-000000000002',
      'c1000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001',
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'a1000000-0000-4000-8000-000000000002',
      'Solicitud que debe revertirse',
      '',
      '',
      '2026-01-10T00:00:00Z'
    );
    raise exception 'invalid plant must fail';
  exception when foreign_key_violation then null;
  end;

  if exists (
    select 1 from app.worker_requests
    where id = 'c0000000-0000-4000-8000-000000000002'
  ) or exists (
    select 1 from app.workers
    where id = 'c1000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'failed request_worker call must roll back both rows';
  end if;
end;
$$;

select app.expire_provisional_workers(
  '30000000-0000-4000-8000-000000000001',
  '2026-01-13T00:00:01Z'
);

do $$
begin
  if not exists (
    select 1
    from app.workers
    where id = 'c1000000-0000-4000-8000-000000000001'
      and status = 'PROVISIONAL_VENCIDO'
      and is_active
  ) then
    raise exception 'expired worker must remain active';
  end if;
end;
$$;

select app.resolve_worker_request(
  '30000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'APPROVE',
  null,
  null,
  '2026-01-14T00:00:00Z',
  'c2000000-0000-4000-8000-000000000001'
);

do $$
begin
  if not exists (
    select 1
    from app.worker_requests as requests
    join app.workers as workers
      on workers.organization_id = requests.organization_id
     and workers.source_request_id = requests.id
    where requests.id = 'c0000000-0000-4000-8000-000000000001'
      and requests.status = 'APPROVED'
      and workers.status = 'ACTIVO'
      and workers.is_active
  ) then
    raise exception 'approval must update request and worker together';
  end if;

  begin
    perform app.resolve_worker_request(
      '30000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'REJECT',
      'Already approved',
      null,
      '2026-01-14T01:00:00Z',
      'c2000000-0000-4000-8000-000000000002'
    );
    raise exception 'resolved request must not resolve twice';
  exception when check_violation then null;
  end;
end;
$$;

insert into auth.users (id, email)
values
  ('d0000000-0000-4000-8000-000000000001', 'company-manager-fixture@example.invalid'),
  ('d0000000-0000-4000-8000-000000000002', 'pending-admin-fixture@example.invalid');

insert into app.user_profiles (
  id,
  organization_id,
  auth_user_id,
  role_id,
  display_name,
  account_status
)
select
  'd1000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  roles.id,
  'Jefe de empresa ficticio',
  'ACTIVE'
from app.roles
where roles.code = 'JEFE_EMPRESA';

insert into app.user_profiles (
  id,
  organization_id,
  auth_user_id,
  role_id,
  display_name,
  account_status
)
select
  'd1000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  roles.id,
  'Administrador pendiente ficticio',
  'PENDING_APPROVAL'
from app.roles
where roles.code = 'ADMINISTRADOR';

select app.govern_account(
  '30000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001',
  'APPROVE',
  null,
  '2026-01-15T00:00:00Z'
);

do $$
begin
  if not exists (
    select 1
    from app.user_profiles
    where id = 'd1000000-0000-4000-8000-000000000002'
      and account_status = 'ACTIVE'
      and approved_by_profile_id = 'd1000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'company manager must approve administrator';
  end if;

  begin
    perform app.govern_account(
      '30000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'SUSPEND',
      'Self suspension must fail',
      '2026-01-15T01:00:00Z'
    );
    raise exception 'self governance must fail';
  exception when check_violation then null;
  end;

  begin
    perform app.govern_account(
      '30000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'SUSPEND',
      'Administrator must not suspend manager',
      '2026-01-15T01:00:00Z'
    );
    raise exception 'administrator must not govern company manager';
  exception when insufficient_privilege then null;
  end;
end;
$$;
