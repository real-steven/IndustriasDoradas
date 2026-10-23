-- Sprint 6.5: el jefe completa una omisión una sola vez. Gerencia puede
-- agregar una versión posterior sin reescribir ninguna marca anterior.

create unique index ux_attendance_events_single_replacement
  on app.attendance_events (organization_id, related_event_id, event_type)
  where event_type in ('ADJUSTED_CHECK_IN', 'ADJUSTED_CHECK_OUT');

create or replace function app.validate_attendance_adjustment_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  related app.attendance_events%rowtype;
  actor_role text;
begin
  if new.related_event_id is null then
    return new;
  end if;

  select event.* into related
  from app.attendance_events as event
  where event.organization_id = new.organization_id
    and event.id = new.related_event_id;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'ATTENDANCE_ADJUSTMENT_RELATED_NOT_FOUND';
  end if;

  if related.plant_id <> new.plant_id
     or related.worker_id <> new.worker_id then
    raise exception using
      errcode = '23514',
      message = 'ATTENDANCE_ADJUSTMENT_CONTEXT_MISMATCH';
  end if;

  select roles.code into actor_role
  from app.user_profiles as profiles
  join app.roles on roles.id = profiles.role_id
  where profiles.organization_id = new.organization_id
    and profiles.id = new.corrected_by_profile_id
    and profiles.is_active;

  if actor_role not in ('JEFE_PLANTA', 'JEFE_EMPRESA') then
    raise exception using
      errcode = '42501',
      message = 'ATTENDANCE_CORRECTION_ACTOR_NOT_AUTHORIZED';
  end if;

  if actor_role = 'JEFE_PLANTA' and (
    (new.event_type = 'ADJUSTED_CHECK_IN'
      and related.event_type not in ('CHECK_OUT', 'ADJUSTED_CHECK_OUT'))
    or
    (new.event_type = 'ADJUSTED_CHECK_OUT'
      and related.event_type not in ('CHECK_IN', 'ADJUSTED_CHECK_IN'))
  ) then
    raise exception using
      errcode = '42501',
      message = 'ATTENDANCE_PLANT_MANAGER_CAN_ONLY_COMPLETE_OMISSION';
  end if;

  return new;
end;
$$;

revoke all on function app.validate_attendance_adjustment_v1()
  from public, anon, authenticated;
grant execute on function app.validate_attendance_adjustment_v1()
  to service_role;

insert into app.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from app.roles
join app.permissions on permissions.code = 'attendance.correct'
where roles.code = 'JEFE_EMPRESA'
on conflict (role_id, permission_id) do nothing;
