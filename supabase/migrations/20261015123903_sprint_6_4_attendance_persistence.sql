-- Sprint 6.4: asistencia append-only y tarifas versionadas por trabajador.
-- El esquema app no se expone directamente a clientes; NestJS usa service_role.

create table app.attendance_events (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  station_id uuid not null,
  worker_id uuid not null,
  client_sequence bigint not null,
  event_type text not null,
  occurred_at_utc timestamptz not null,
  recorded_at_utc timestamptz not null,
  confirmed_at_utc timestamptz,
  sync_status text not null default 'SYNCHRONIZED',
  corrected_by_profile_id uuid,
  correction_reason text,
  related_event_id uuid,
  created_at timestamptz not null default now(),
  constraint attendance_events_organization_id_id_unique
    unique (organization_id, id),
  constraint attendance_events_station_sequence_unique
    unique (organization_id, station_id, client_sequence),
  constraint attendance_events_plant_fk
    foreign key (organization_id, plant_id)
    references app.plants (organization_id, id) on delete restrict,
  constraint attendance_events_station_fk
    foreign key (organization_id, plant_id, station_id)
    references app.stations (organization_id, plant_id, id) on delete restrict,
  constraint attendance_events_worker_fk
    foreign key (organization_id, worker_id)
    references app.workers (organization_id, id) on delete restrict,
  constraint attendance_events_corrected_by_fk
    foreign key (organization_id, corrected_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint attendance_events_related_fk
    foreign key (organization_id, related_event_id)
    references app.attendance_events (organization_id, id) on delete restrict,
  constraint attendance_events_sequence_check check (client_sequence > 0),
  constraint attendance_events_type_check check (
    event_type in ('CHECK_IN', 'CHECK_OUT', 'ADJUSTED_CHECK_IN', 'ADJUSTED_CHECK_OUT')
  ),
  constraint attendance_events_sync_status_check check (
    sync_status in ('PENDING', 'SYNCHRONIZED', 'REQUIRES_ATTENTION')
  ),
  constraint attendance_events_confirmation_check check (
    sync_status <> 'SYNCHRONIZED' or confirmed_at_utc is not null
  ),
  constraint attendance_events_adjustment_check check (
    (
      event_type in ('CHECK_IN', 'CHECK_OUT')
      and corrected_by_profile_id is null
      and correction_reason is null
      and related_event_id is null
    )
    or (
      event_type in ('ADJUSTED_CHECK_IN', 'ADJUSTED_CHECK_OUT')
      and corrected_by_profile_id is not null
      and btrim(coalesce(correction_reason, '')) <> ''
      and related_event_id is not null
      and related_event_id <> id
    )
  )
);

create index ix_attendance_events_worker_occurrence
  on app.attendance_events (organization_id, worker_id, occurred_at_utc, id);
create index ix_attendance_events_plant_occurrence
  on app.attendance_events (organization_id, plant_id, occurred_at_utc desc, id);
create index ix_attendance_events_station_fk
  on app.attendance_events (organization_id, plant_id, station_id);
create index ix_attendance_events_related_fk
  on app.attendance_events (organization_id, related_event_id);
create index ix_attendance_events_corrected_by_fk
  on app.attendance_events (organization_id, corrected_by_profile_id);

create function app.validate_attendance_adjustment_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  related app.attendance_events%rowtype;
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

  if (
    new.event_type = 'ADJUSTED_CHECK_IN'
    and related.event_type not in ('CHECK_OUT', 'ADJUSTED_CHECK_OUT')
  ) or (
    new.event_type = 'ADJUSTED_CHECK_OUT'
    and related.event_type not in ('CHECK_IN', 'ADJUSTED_CHECK_IN')
  ) then
    raise exception using
      errcode = '23514',
      message = 'ATTENDANCE_ADJUSTMENT_DIRECTION_MISMATCH';
  end if;

  return new;
end;
$$;

revoke all on function app.validate_attendance_adjustment_v1()
  from public, anon, authenticated;
grant execute on function app.validate_attendance_adjustment_v1()
  to service_role;

create trigger trg_validate_attendance_adjustment
before insert on app.attendance_events
for each row execute function app.validate_attendance_adjustment_v1();

create function app.reject_attendance_history_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'ATTENDANCE_HISTORY_IS_APPEND_ONLY';
end;
$$;

revoke all on function app.reject_attendance_history_mutation_v1()
  from public, anon, authenticated;
grant execute on function app.reject_attendance_history_mutation_v1()
  to service_role;

create trigger trg_attendance_events_append_only
before update or delete on app.attendance_events
for each row execute function app.reject_attendance_history_mutation_v1();

create table app.worker_pay_rate_versions (
  id uuid primary key,
  organization_id uuid not null,
  worker_id uuid not null,
  regular_hourly_rate numeric(12, 2) not null,
  night_multiplier numeric(6, 3) not null default 1.5,
  effective_from_utc timestamptz not null,
  recorded_by_profile_id uuid not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint worker_pay_rate_versions_organization_id_id_unique
    unique (organization_id, id),
  constraint worker_pay_rate_versions_effective_unique
    unique (organization_id, worker_id, effective_from_utc),
  constraint worker_pay_rate_versions_worker_fk
    foreign key (organization_id, worker_id)
    references app.workers (organization_id, id) on delete restrict,
  constraint worker_pay_rate_versions_recorded_by_fk
    foreign key (organization_id, recorded_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint worker_pay_rate_versions_regular_rate_check
    check (regular_hourly_rate > 0),
  constraint worker_pay_rate_versions_night_multiplier_check
    check (night_multiplier > 0),
  constraint worker_pay_rate_versions_reason_check
    check (btrim(reason) <> '')
);

create index ix_worker_pay_rate_versions_current
  on app.worker_pay_rate_versions (
    organization_id, worker_id, effective_from_utc desc, id
  );
create index ix_worker_pay_rate_versions_recorded_by_fk
  on app.worker_pay_rate_versions (organization_id, recorded_by_profile_id);

create trigger trg_worker_pay_rate_versions_append_only
before update or delete on app.worker_pay_rate_versions
for each row execute function app.reject_attendance_history_mutation_v1();

alter table app.attendance_events enable row level security;
alter table app.worker_pay_rate_versions enable row level security;

create policy backend_service_all on app.attendance_events
  for all to service_role using (true) with check (true);
create policy backend_service_all on app.worker_pay_rate_versions
  for all to service_role using (true) with check (true);

revoke all on table app.attendance_events from public, anon, authenticated;
revoke all on table app.worker_pay_rate_versions from public, anon, authenticated;
grant select, insert on table app.attendance_events to service_role;
grant select, insert on table app.worker_pay_rate_versions to service_role;

insert into app.permissions (id, code, description)
values
  ('10000000-0000-4000-8000-000000000017', 'attendance.review_recent', 'Revisar asistencia pendiente reciente.'),
  ('10000000-0000-4000-8000-000000000018', 'attendance.correct', 'Corregir asistencia mediante ajuste auditado.'),
  ('10000000-0000-4000-8000-000000000028', 'attendance.read', 'Consultar asistencia, jornadas e incidencias.'),
  ('10000000-0000-4000-8000-000000000029', 'attendance.record', 'Registrar entrada y salida desde una estación autorizada.'),
  ('10000000-0000-4000-8000-000000000030', 'attendance.pay_rates.read', 'Consultar tarifas horarias versionadas.'),
  ('10000000-0000-4000-8000-000000000031', 'attendance.pay_rates.manage', 'Configurar tarifas horarias por trabajador.')
on conflict (id) do update
set code = excluded.code, description = excluded.description, is_active = true;

with assignments (role_code, permission_code) as (
  values
    ('JEFE_EMPRESA', 'workers.read'),
    ('JEFE_EMPRESA', 'attendance.read'),
    ('JEFE_EMPRESA', 'attendance.pay_rates.read'),
    ('JEFE_EMPRESA', 'attendance.pay_rates.manage'),
    ('JEFE_PLANTA', 'attendance.record'),
    ('JEFE_PLANTA', 'attendance.review_recent'),
    ('JEFE_PLANTA', 'attendance.correct')
)
insert into app.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from assignments
join app.roles on roles.code = assignments.role_code
join app.permissions on permissions.code = assignments.permission_code
on conflict (role_id, permission_id) do nothing;

comment on table app.attendance_events is
  'Marcas y ajustes de asistencia inmutables; las jornadas y horas son proyecciones.';
comment on table app.worker_pay_rate_versions is
  'Tarifas brutas versionadas por trabajador; no constituye nomina ni comprobante de pago.';
