-- Verifica superadministracion gerencial, permisos individuales y delegacion
-- sin escalada de privilegios.

do $$
begin
  if not app.profile_has_permission(
    '30000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'inventory.manage'
  ) then
    raise exception 'JEFE_EMPRESA must receive every active permission';
  end if;

  if app.profile_has_permission(
    '30000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'inventory.manage'
  ) then
    raise exception 'new ADMINISTRADOR must not inherit business mutations';
  end if;
end;
$$;

insert into auth.users (id, email)
values ('e2000000-0000-4000-8000-000000000001', 'delegated-admin-fixture@example.invalid');

insert into app.user_profiles (
  id,
  organization_id,
  auth_user_id,
  role_id,
  display_name,
  account_status
)
select
  'e2000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  roles.id,
  'Administrador delegado ficticio',
  'ACTIVE'
from app.roles
where roles.code = 'ADMINISTRADOR';

select app.replace_administrator_permissions(
  '30000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001',
  array[
    'administrators.create',
    'administrators.permissions.manage',
    'inventory.manage'
  ],
  array[
    'e3000000-0000-4000-8000-000000000001'::uuid,
    'e3000000-0000-4000-8000-000000000002'::uuid,
    'e3000000-0000-4000-8000-000000000003'::uuid
  ],
  '2026-01-16T02:00:00Z'
);

select app.replace_administrator_permissions(
  '30000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000002',
  array['inventory.manage'],
  array['e3000000-0000-4000-8000-000000000004'::uuid],
  '2026-01-16T03:00:00Z'
);

do $$
begin
  if not app.profile_has_permission(
    '30000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000002',
    'inventory.manage'
  ) then
    raise exception 'delegated administrator must grant a permission it owns';
  end if;

  begin
    perform app.replace_administrator_permissions(
      '30000000-0000-4000-8000-000000000001',
      'e2000000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000002',
      array['inventory.manage', 'workers.resolve'],
      array[
        'e3000000-0000-4000-8000-000000000005'::uuid,
        'e3000000-0000-4000-8000-000000000006'::uuid
      ],
      '2026-01-16T04:00:00Z'
    );
    raise exception 'administrator must not delegate a permission it does not own';
  exception when insufficient_privilege then null;
  end;

  begin
    perform app.replace_administrator_permissions(
      '30000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000002',
      array['inventory.manage'],
      array['e3000000-0000-4000-8000-000000000007'::uuid],
      '2026-01-16T05:00:00Z'
    );
    raise exception 'administrator must not change its own permissions';
  exception when check_violation then null;
  end;
end;
$$;

select app.replace_administrator_permissions(
  '30000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001',
  array['inventory.manage', 'administrators.create'],
  array[
    'e1000000-0000-4000-8000-000000000001'::uuid,
    'e1000000-0000-4000-8000-000000000002'::uuid
  ],
  '2026-01-16T06:00:00Z'
);

do $$
begin
  if not app.profile_has_permission(
    '30000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'inventory.manage'
  ) then
    raise exception 'individual permission grant must take effect immediately';
  end if;

  if not exists (
    select 1
    from app.user_permission_grants
    where organization_id = '30000000-0000-4000-8000-000000000001'
      and user_profile_id = 'd1000000-0000-4000-8000-000000000002'
      and permission_id = (
        select id from app.permissions where code = 'inventory.manage'
      )
      and revoked_at is null
  ) then
    raise exception 'active permission grant must be persisted';
  end if;
end;
$$;

select app.replace_administrator_permissions(
  '30000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001',
  array['administrators.create'],
  array['e1000000-0000-4000-8000-000000000003'::uuid],
  '2026-01-16T07:00:00Z'
);

do $$
begin
  if app.profile_has_permission(
    '30000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'inventory.manage'
  ) then
    raise exception 'revoked permission must stop authorizing immediately';
  end if;

  if not exists (
    select 1
    from app.user_permission_grants
    where organization_id = '30000000-0000-4000-8000-000000000001'
      and user_profile_id = 'd1000000-0000-4000-8000-000000000002'
      and permission_id = (
        select id from app.permissions where code = 'inventory.manage'
      )
      and revoked_at = '2026-01-16T07:00:00Z'
  ) then
    raise exception 'revocation history must be retained';
  end if;
end;
$$;
