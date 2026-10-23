-- Sprint 6.4: persistencia central append-only, aislamiento y tarifas versionadas.

insert into auth.users (id, email)
values ('a0000000-0000-4000-8000-000000000003', 'management-fixture@example.invalid');

insert into app.user_profiles (
  id, organization_id, auth_user_id, role_id, display_name,
  preferred_locale, account_status
)
select
  'a1000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000003',
  roles.id,
  'Gerencia ficticia',
  'es',
  'ACTIVE'
from app.roles
where roles.code = 'JEFE_EMPRESA';

insert into app.attendance_events (
  id, organization_id, plant_id, station_id, worker_id, client_sequence,
  event_type, occurred_at_utc, recorded_at_utc, confirmed_at_utc, sync_status
) values (
  'f6100000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  990001, 'CHECK_IN',
  '2026-10-15T12:00:00Z', '2026-10-15T12:00:01Z',
  '2026-10-15T12:00:02Z', 'SYNCHRONIZED'
);

insert into app.attendance_events (
  id, organization_id, plant_id, station_id, worker_id, client_sequence,
  event_type, occurred_at_utc, recorded_at_utc, confirmed_at_utc, sync_status,
  corrected_by_profile_id, correction_reason, related_event_id
) values (
  'f6100000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  990002, 'ADJUSTED_CHECK_OUT',
  '2026-10-15T20:00:00Z', '2026-10-15T20:05:00Z',
  '2026-10-15T20:05:01Z', 'SYNCHRONIZED',
  'a1000000-0000-4000-8000-000000000002',
  'El trabajador olvidó registrar la salida.',
  'f6100000-0000-4000-8000-000000000001'
);

insert into app.worker_pay_rate_versions (
  id, organization_id, worker_id, regular_hourly_rate, night_multiplier,
  effective_from_utc, recorded_by_profile_id, reason
) values
  (
    'f6200000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    1500.00, 1.500, '2026-10-01T00:00:00Z',
    'a1000000-0000-4000-8000-000000000001',
    'Tarifa inicial configurable.'
  ),
  (
    'f6200000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    1750.00, 1.500, '2026-11-01T00:00:00Z',
    'a1000000-0000-4000-8000-000000000001',
    'Nueva tarifa sin reescribir el historial.'
  );

do $$
begin
  if (select count(*) from app.attendance_events
      where worker_id = 'b1000000-0000-4000-8000-000000000001'
        and id in (
          'f6100000-0000-4000-8000-000000000001',
          'f6100000-0000-4000-8000-000000000002'
        )) <> 2 then
    raise exception 'attendance marks and audited adjustment must persist';
  end if;

  if (select count(*) from app.worker_pay_rate_versions
      where worker_id = 'b1000000-0000-4000-8000-000000000001'
        and id in (
          'f6200000-0000-4000-8000-000000000001',
          'f6200000-0000-4000-8000-000000000002'
        )) <> 2 then
    raise exception 'pay rate history must be versioned';
  end if;

  begin
    update app.attendance_events
    set occurred_at_utc = '2026-10-15T12:01:00Z'
    where id = 'f6100000-0000-4000-8000-000000000001';
    raise exception 'attendance history must reject updates';
  exception when object_not_in_prerequisite_state then null;
  end;

  begin
    delete from app.worker_pay_rate_versions
    where id = 'f6200000-0000-4000-8000-000000000001';
    raise exception 'pay history must reject deletes';
  exception when object_not_in_prerequisite_state then null;
  end;

  begin
    insert into app.attendance_events (
      id, organization_id, plant_id, station_id, worker_id, client_sequence,
      event_type, occurred_at_utc, recorded_at_utc, sync_status
    ) values (
      'f6100000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '34000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      990001, 'CHECK_OUT',
      '2026-10-15T20:00:00Z', '2026-10-15T20:00:01Z', 'PENDING'
    );
    raise exception 'station sequence must be unique';
  exception when unique_violation then null;
  end;

  begin
    insert into app.attendance_events (
      id, organization_id, plant_id, station_id, worker_id, client_sequence,
      event_type, occurred_at_utc, recorded_at_utc, sync_status,
      corrected_by_profile_id, correction_reason, related_event_id
    ) values (
      'f6100000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '34000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      990004, 'CHECK_OUT',
      '2026-10-15T20:00:00Z', '2026-10-15T20:00:01Z', 'PENDING',
      'a1000000-0000-4000-8000-000000000002', 'No permitido',
      'f6100000-0000-4000-8000-000000000001'
    );
    raise exception 'ordinary mark must reject correction metadata';
  exception when check_violation then null;
  end;

  begin
    insert into app.attendance_events (
      id, organization_id, plant_id, station_id, worker_id, client_sequence,
      event_type, occurred_at_utc, recorded_at_utc, sync_status,
      corrected_by_profile_id, correction_reason, related_event_id
    ) values (
      'f6100000-0000-4000-8000-000000000006',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '34000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      990006, 'ADJUSTED_CHECK_OUT',
      '2026-10-15T19:00:00Z', '2026-10-16T12:00:00Z', 'PENDING',
      'a1000000-0000-4000-8000-000000000003',
      'Gerencia confirmó la hora real de salida.',
      'f6100000-0000-4000-8000-000000000002'
    );

    if not exists (
      select 1 from app.attendance_events
      where id = 'f6100000-0000-4000-8000-000000000006'
        and related_event_id = 'f6100000-0000-4000-8000-000000000002'
    ) then
      raise exception 'management correction must append a new auditable version';
    end if;
  end;

  begin
    insert into app.attendance_events (
      id, organization_id, plant_id, station_id, worker_id, client_sequence,
      event_type, occurred_at_utc, recorded_at_utc, sync_status,
      corrected_by_profile_id, correction_reason, related_event_id
    ) values (
      'f6100000-0000-4000-8000-000000000007',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '34000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      990007, 'ADJUSTED_CHECK_OUT',
      '2026-10-15T18:30:00Z', '2026-10-16T12:01:00Z', 'PENDING',
      'a1000000-0000-4000-8000-000000000002',
      'El jefe intentó modificar una corrección cerrada.',
      'f6100000-0000-4000-8000-000000000002'
    );
    raise exception 'plant manager must not revise an existing correction';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into app.attendance_events (
      id, organization_id, plant_id, station_id, worker_id, client_sequence,
      event_type, occurred_at_utc, recorded_at_utc, sync_status,
      corrected_by_profile_id, correction_reason, related_event_id
    ) values (
      'f6100000-0000-4000-8000-000000000008',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '34000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      990008, 'ADJUSTED_CHECK_OUT',
      '2026-10-15T20:00:00Z', '2026-10-16T12:02:00Z', 'PENDING',
      'a1000000-0000-4000-8000-000000000002',
      'Segundo cierre local no permitido.',
      'f6100000-0000-4000-8000-000000000001'
    );
    raise exception 'plant manager omission correction must be unique';
  exception when unique_violation then null;
  end;

  begin
    insert into app.attendance_events (
      id, organization_id, plant_id, station_id, worker_id, client_sequence,
      event_type, occurred_at_utc, recorded_at_utc, sync_status,
      corrected_by_profile_id, correction_reason, related_event_id
    ) values (
      'f6100000-0000-4000-8000-000000000005',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '34000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      990005, 'ADJUSTED_CHECK_IN',
      '2026-10-15T11:59:00Z', '2026-10-15T20:00:01Z', 'PENDING',
      'a1000000-0000-4000-8000-000000000002', 'Dirección incompatible',
      'f6100000-0000-4000-8000-000000000001'
    );
    raise exception 'adjustment direction must be checked';
  exception when insufficient_privilege then null;
  end;

  if not exists (
    select 1 from pg_class as class
    join pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'app'
      and class.relname in ('attendance_events', 'worker_pay_rate_versions')
      and class.relrowsecurity
    group by namespace.nspname
    having count(*) = 2
  ) then
    raise exception 'attendance tables must have RLS enabled';
  end if;

  if has_table_privilege('anon', 'app.attendance_events', 'SELECT')
     or has_table_privilege('authenticated', 'app.worker_pay_rate_versions', 'SELECT') then
    raise exception 'desktop and browser roles must not access private attendance tables';
  end if;

  if not has_table_privilege('service_role', 'app.attendance_events', 'SELECT,INSERT')
     or not has_table_privilege('service_role', 'app.worker_pay_rate_versions', 'SELECT,INSERT') then
    raise exception 'backend service must receive explicit attendance privileges';
  end if;

  if not exists (
    select 1
    from app.role_permissions
    join app.roles on roles.id = role_permissions.role_id
    join app.permissions on permissions.id = role_permissions.permission_id
    where roles.code = 'JEFE_PLANTA' and permissions.code = 'attendance.correct'
  ) then
    raise exception 'plant manager correction permission is missing';
  end if;

  if not exists (
    select 1
    from app.role_permissions
    join app.roles on roles.id = role_permissions.role_id
    join app.permissions on permissions.id = role_permissions.permission_id
    where roles.code = 'JEFE_EMPRESA'
      and permissions.code = 'attendance.pay_rates.manage'
  ) then
    raise exception 'management pay-rate permission is missing';
  end if;

  if not exists (
    select 1
    from app.role_permissions
    join app.roles on roles.id = role_permissions.role_id
    join app.permissions on permissions.id = role_permissions.permission_id
    where roles.code = 'JEFE_EMPRESA'
      and permissions.code = 'attendance.correct'
  ) then
    raise exception 'management attendance correction permission is missing';
  end if;
end;
$$;
