-- Prueba del ciclo de trabajador y de las restricciones del jefe de planta.

insert into auth.users (id, email)
values
  ('a0000000-0000-4000-8000-000000000001', 'admin-fixture@example.invalid'),
  ('a0000000-0000-4000-8000-000000000002', 'manager-fixture@example.invalid');

insert into app.user_profiles (
  id,
  organization_id,
  auth_user_id,
  role_id,
  display_name,
  preferred_locale,
  account_status
)
select
  'a1000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  roles.id,
  'Administrador ficticio',
  'es',
  'ACTIVE'
from app.roles
where roles.code = 'ADMINISTRADOR';

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
  '30000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  permissions.id,
  'a1000000-0000-4000-8000-000000000001',
  '2026-01-01T00:00:00Z'
from app.permissions
where permissions.code in (
  'audit.read_operational',
  'administrators.provision_approved',
  'plant_managers.manage',
  'organization_catalogs.read',
  'organization_catalogs.manage',
  'stations.manage',
  'suppliers.manage',
  'workers.resolve',
  'workers.read',
  'cycles.correct_open',
  'cycles.correct_closed',
  'attendance.correct',
  'inventory.manage'
);

insert into app.user_profiles (
  id,
  organization_id,
  auth_user_id,
  role_id,
  display_name,
  preferred_locale,
  account_status,
  approved_by_profile_id,
  approved_at
)
select
  'a1000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  roles.id,
  'Jefe de planta ficticio',
  'es',
  'ACTIVE',
  'a1000000-0000-4000-8000-000000000001',
  '2026-01-01T00:00:00Z'
from app.roles
where roles.code = 'JEFE_PLANTA';

insert into app.user_plant_scopes (
  organization_id,
  user_profile_id,
  plant_id
)
values (
  '30000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  '31000000-0000-4000-8000-000000000001'
);

insert into app.station_user_authorizations (
  id,
  organization_id,
  plant_id,
  station_id,
  user_profile_id,
  authorized_by_profile_id
)
values (
  'a2000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001'
);

insert into app.user_pin_credentials (
  id,
  organization_id,
  user_profile_id,
  verifier,
  changed_by_profile_id
)
values (
  'a3000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'fixture-kdf-verifier-not-a-real-pin',
  'a1000000-0000-4000-8000-000000000002'
);

do $$
begin
  begin
    insert into app.user_pin_credentials (
      id,
      organization_id,
      user_profile_id,
      verifier,
      changed_by_profile_id
    ) values (
      'a3000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'invalid-role-fixture',
      'a1000000-0000-4000-8000-000000000001'
    );
    raise exception 'administrator must not own a plant manager PIN';
  exception
    when check_violation then
      null;
  end;
end;
$$;

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
  resolved_at
)
values (
  'b0000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'Trabajador canonico ficticio',
  'APPROVED',
  '2026-01-01T00:00:00Z',
  '2026-01-04T00:00:00Z',
  'a1000000-0000-4000-8000-000000000001',
  '2026-01-01T01:00:00Z'
);

insert into app.workers (
  id,
  organization_id,
  plant_id,
  source_request_id,
  name,
  status
)
values (
  'b1000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'Trabajador canonico ficticio',
  'ACTIVO'
);

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
  resolution_reason
)
values (
  'b0000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'Trabajador duplicado ficticio',
  'MERGED',
  '2026-01-02T00:00:00Z',
  '2026-01-05T00:00:00Z',
  'a1000000-0000-4000-8000-000000000001',
  '2026-01-02T01:00:00Z',
  'Duplicado de prueba'
);

insert into app.workers (
  id,
  organization_id,
  plant_id,
  source_request_id,
  name,
  status,
  is_active,
  deactivated_at
)
values (
  'b1000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  'Trabajador duplicado ficticio',
  'RECHAZADO',
  false,
  '2026-01-02T01:00:00Z'
);

insert into app.worker_merges (
  id,
  organization_id,
  source_worker_id,
  target_worker_id,
  source_request_id,
  merged_by_profile_id,
  reason
)
values (
  'b2000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001',
  'Duplicado de prueba'
);

insert into app.worker_requests (
  id,
  organization_id,
  plant_id,
  requested_by_profile_id,
  requested_name,
  requested_at,
  review_due_at
)
values (
  'b0000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'Trabajador vencido ficticio',
  '2026-01-03T00:00:00Z',
  '2026-01-06T00:00:00Z'
);

insert into app.workers (
  id,
  organization_id,
  plant_id,
  source_request_id,
  name,
  status
)
values (
  'b1000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000003',
  'Trabajador vencido ficticio',
  'PROVISIONAL_VENCIDO'
);

do $$
declare
  actual_count integer;
begin
  select count(*)
    into actual_count
  from app.workers
  where status = 'PROVISIONAL_VENCIDO'
    and is_active;

  if actual_count <> 1 then
    raise exception 'expired provisional worker must remain active';
  end if;

  select count(*) into actual_count from app.worker_merges;
  if actual_count <> 1 then
    raise exception 'worker merge must preserve one origin-to-canonical link';
  end if;

  begin
    update app.worker_merges
    set reason = 'Mutation must fail'
    where id = 'b2000000-0000-4000-8000-000000000001';
    raise exception 'worker merge history must be immutable';
  exception
    when object_not_in_prerequisite_state then
      null;
  end;

  begin
    insert into app.worker_requests (
      id,
      organization_id,
      plant_id,
      requested_by_profile_id,
      requested_name,
      requested_at,
      review_due_at
    ) values (
      'b0000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      'Invalid due fixture',
      '2026-01-04T00:00:00Z',
      '2026-01-06T23:00:00Z'
    );
    raise exception 'review due must be exactly 72 hours';
  exception
    when check_violation then
      null;
  end;
end;
$$;
