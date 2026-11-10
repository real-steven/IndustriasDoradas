-- Valida la edición unificada del expediente y la suspensión coordinada de
-- trabajadores que también poseen una cuenta de jefe de planta.

select app.update_worker_profile_v1(
  '30000000-0000-4000-8000-000000000001',
  '37100000-0000-4000-8000-000000000001',
  'Operario actualizado',
  '1-1111-1111',
  'operario.actualizado@example.invalid',
  '8888-1111'
);

do $$
begin
  if not exists (
    select 1
    from app.workers
    where id = '37100000-0000-4000-8000-000000000001'
      and name = 'Operario actualizado'
      and identity_number = '1-1111-1111'
      and email = 'operario.actualizado@example.invalid'
      and phone = '8888-1111'
  ) then
    raise exception 'worker profile fields were not updated together';
  end if;

  if not exists (
    select 1
    from app.management_worker_payroll_profiles
    where id = '37100000-0000-4000-8000-000000000001'
      and email = 'operario.actualizado@example.invalid'
      and phone = '8888-1111'
  ) then
    raise exception 'management payroll view must expose editable contact data';
  end if;
end;
$$;

do $$
declare
  linked_worker_id uuid;
begin
  select id
  into linked_worker_id
  from app.workers
  where user_profile_id = 'f5110000-0000-4000-8000-000000000001';

  perform app.update_worker_profile_v1(
    '30000000-0000-4000-8000-000000000001',
    linked_worker_id,
    'Jefatura actualizada',
    '2-2222-2222',
    'jefatura@example.invalid',
    '8888-2222'
  );

  if not exists (
    select 1
    from app.user_profiles
    where id = 'f5110000-0000-4000-8000-000000000001'
      and display_name = 'Jefatura actualizada'
  ) then
    raise exception 'linked manager display name must follow the worker record';
  end if;

  perform app.set_worker_management_state_v1(
    '30000000-0000-4000-8000-000000000001',
    linked_worker_id,
    'd1000000-0000-4000-8000-000000000001',
    false,
    'Suspensión temporal de prueba',
    '2026-11-09T21:30:00Z'
  );

  if not exists (
    select 1
    from app.workers
    where id = linked_worker_id
      and not is_active
      and deactivated_at = '2026-11-09T21:30:00Z'
  ) then
    raise exception 'linked worker must be suspended';
  end if;

  if not exists (
    select 1
    from app.user_profiles
    where id = 'f5110000-0000-4000-8000-000000000001'
      and account_status = 'SUSPENDED'
      and is_active
  ) then
    raise exception 'linked manager account must be suspended atomically';
  end if;

  perform app.set_worker_management_state_v1(
    '30000000-0000-4000-8000-000000000001',
    linked_worker_id,
    'd1000000-0000-4000-8000-000000000001',
    true,
    null,
    '2026-11-09T21:35:00Z'
  );

  if not exists (
    select 1
    from app.workers
    where id = linked_worker_id
      and is_active
      and deactivated_at is null
  ) or not exists (
    select 1
    from app.user_profiles
    where id = 'f5110000-0000-4000-8000-000000000001'
      and account_status = 'ACTIVE'
      and is_active
  ) then
    raise exception 'reactivation must restore both worker and manager account';
  end if;
end;
$$;
