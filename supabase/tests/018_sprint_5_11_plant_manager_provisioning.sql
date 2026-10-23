-- Valida el aprovisionamiento directo y la compuerta de activacion de 5.11.

insert into auth.users (id, email)
values (
  'f5100000-0000-4000-8000-000000000001',
  'plant-manager-5-11@example.invalid'
);

select app.provision_plant_manager(
  '30000000-0000-4000-8000-000000000001',
  'f5110000-0000-4000-8000-000000000001',
  'f5100000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'Jefe de planta 5.11',
  'es',
  '31000000-0000-4000-8000-000000000001',
  array['34000000-0000-4000-8000-000000000001'::uuid],
  array['f5120000-0000-4000-8000-000000000001'::uuid],
  'f5130000-0000-4000-8000-000000000001',
  'fixture-kdf-verifier-not-a-real-pin',
  '2026-10-18T12:00:00Z'
);

do $$
begin
  if not exists (
    select 1
    from app.user_profiles
    where id = 'f5110000-0000-4000-8000-000000000001'
      and account_status = 'PENDING_APPROVAL'
      and provisioning_method = 'DIRECT'
  ) then
    raise exception 'direct plant manager must remain pending approval';
  end if;

  if not exists (
    select 1
    from app.user_plant_scopes
    where user_profile_id = 'f5110000-0000-4000-8000-000000000001'
      and plant_id = '31000000-0000-4000-8000-000000000001'
      and is_active
  ) then
    raise exception 'pending plant manager must receive its active plant scope';
  end if;

  if not exists (
    select 1
    from app.station_user_authorizations
    where user_profile_id = 'f5110000-0000-4000-8000-000000000001'
      and station_id = '34000000-0000-4000-8000-000000000001'
      and authorized_by_profile_id = 'd1000000-0000-4000-8000-000000000001'
      and is_active
  ) then
    raise exception 'pending plant manager must receive its station authorization';
  end if;

  if not exists (
    select 1
    from app.user_pin_credentials
    where user_profile_id = 'f5110000-0000-4000-8000-000000000001'
      and changed_by_profile_id = 'd1000000-0000-4000-8000-000000000001'
      and verifier = 'fixture-kdf-verifier-not-a-real-pin'
  ) then
    raise exception 'PIN verifier must be attributed to the manager without storing the PIN';
  end if;

  if not exists (
    select 1
    from app.workers
    where organization_id = '30000000-0000-4000-8000-000000000001'
      and user_profile_id = 'f5110000-0000-4000-8000-000000000001'
      and plant_id = '31000000-0000-4000-8000-000000000001'
      and name = 'Jefe de planta 5.11'
      and status = 'ACTIVO'
      and is_active
  ) then
    raise exception 'plant manager provisioning must create its active attendance worker';
  end if;
end;
$$;

select app.govern_account(
  '30000000-0000-4000-8000-000000000001',
  'f5110000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'APPROVE',
  null,
  '2026-10-18T12:05:00Z'
);

do $$
begin
  if not exists (
    select 1
    from app.user_profiles
    where id = 'f5110000-0000-4000-8000-000000000001'
      and account_status = 'ACTIVE'
      and approved_by_profile_id = 'd1000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'fully configured plant manager must be activatable';
  end if;
end;
$$;

insert into auth.users (id, email)
values (
  'f5100000-0000-4000-8000-000000000002',
  'incomplete-plant-manager-5-11@example.invalid'
);

insert into app.user_profiles (
  id,
  organization_id,
  auth_user_id,
  role_id,
  display_name,
  account_status,
  provisioning_method
)
select
  'f5110000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  'f5100000-0000-4000-8000-000000000002',
  roles.id,
  'Jefe incompleto 5.11',
  'PENDING_APPROVAL',
  'DIRECT'
from app.roles
where roles.code = 'JEFE_PLANTA';

do $$
begin
  begin
    perform app.govern_account(
      '30000000-0000-4000-8000-000000000001',
      'f5110000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000001',
      'APPROVE',
      null,
      '2026-10-18T12:10:00Z'
    );
    raise exception 'incomplete plant manager activation must fail';
  exception when check_violation then null;
  end;
end;
$$;
