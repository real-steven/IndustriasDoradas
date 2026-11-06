-- Pre-nomina gerencial: identificacion, tarifas versionadas y ajustes explicitos.
-- El calculo es bruto y no sustituye una planilla legal ni aplica deducciones.

alter table app.workers
  add column identity_number text;

alter table app.workers
  add constraint workers_identity_number_check
  check (
    identity_number is null
    or (char_length(btrim(identity_number)) between 4 and 30
      and identity_number = btrim(identity_number))
  );

create unique index ux_workers_identity_number
  on app.workers (organization_id, lower(identity_number))
  where identity_number is not null;

create table app.payroll_adjustments (
  id uuid primary key,
  organization_id uuid not null,
  worker_id uuid not null,
  adjustment_date date not null,
  adjustment_type text not null,
  minutes integer,
  amount_crc numeric(14, 2),
  note text not null,
  recorded_by_profile_id uuid not null,
  recorded_at_utc timestamptz not null default now(),
  constraint payroll_adjustments_organization_id_id_unique
    unique (organization_id, id),
  constraint payroll_adjustments_worker_fk
    foreign key (organization_id, worker_id)
    references app.workers (organization_id, id) on delete restrict,
  constraint payroll_adjustments_profile_fk
    foreign key (organization_id, recorded_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint payroll_adjustments_type_check check (
    adjustment_type in (
      'PAID_LEAVE_HOURS',
      'OVERTIME_HOURS',
      'HOLIDAY_HOURS',
      'REST_DAY_HOURS',
      'OTHER_EARNING',
      'OTHER_DEDUCTION'
    )
  ),
  constraint payroll_adjustments_value_check check (
    (
      adjustment_type in (
        'PAID_LEAVE_HOURS',
        'OVERTIME_HOURS',
        'HOLIDAY_HOURS',
        'REST_DAY_HOURS'
      )
      and minutes > 0
      and amount_crc is null
    )
    or (
      adjustment_type in ('OTHER_EARNING', 'OTHER_DEDUCTION')
      and minutes is null
      and amount_crc > 0
    )
  ),
  constraint payroll_adjustments_note_check check (btrim(note) <> '')
);

create index ix_payroll_adjustments_worker_period
  on app.payroll_adjustments (
    organization_id,
    worker_id,
    adjustment_date desc,
    recorded_at_utc desc
  );

create trigger trg_payroll_adjustments_append_only
before update or delete on app.payroll_adjustments
for each row execute function app.reject_attendance_history_mutation_v1();

create view app.management_worker_payroll_profiles
with (security_invoker = true)
as
select
  worker.id,
  worker.organization_id,
  worker.plant_id,
  worker.name,
  worker.identity_number,
  worker.category,
  worker.status,
  worker.is_active,
  rate.id as current_rate_id,
  rate.regular_hourly_rate as current_hourly_rate_crc,
  rate.night_multiplier,
  rate.effective_from_utc as rate_effective_from_utc
from app.workers as worker
left join lateral (
  select version.*
  from app.worker_pay_rate_versions as version
  where version.organization_id = worker.organization_id
    and version.worker_id = worker.id
    and version.effective_from_utc <= now()
  order by version.effective_from_utc desc, version.id desc
  limit 1
) as rate on true;

alter table app.payroll_adjustments enable row level security;

create policy backend_service_all on app.payroll_adjustments
  for all to service_role using (true) with check (true);

revoke all on table app.payroll_adjustments
  from public, anon, authenticated, service_role;
revoke all on table app.management_worker_payroll_profiles
  from public, anon, authenticated, service_role;
grant select, insert on table app.payroll_adjustments to service_role;
grant select on table app.management_worker_payroll_profiles to service_role;

insert into app.permissions (id, code, description)
values
  (
    '10000000-0000-4000-8000-000000000033',
    'payroll.read',
    'Consultar pre-nomina, tarifas y ajustes salariales.'
  ),
  (
    '10000000-0000-4000-8000-000000000034',
    'payroll.manage',
    'Configurar tarifas, identificacion y ajustes de pre-nomina.'
  )
on conflict (id) do update
set code = excluded.code, description = excluded.description, is_active = true;

insert into app.role_permissions (role_id, permission_id)
select role.id, permission.id
from app.roles as role
join app.permissions as permission
  on permission.code in ('payroll.read', 'payroll.manage')
where role.code = 'JEFE_EMPRESA'
on conflict (role_id, permission_id) do nothing;

comment on table app.payroll_adjustments is
  'Ajustes append-only de pre-nomina. Horas confirmadas se pagan a tarifa base; extras y feriados agregan solo su recargo.';
comment on view app.management_worker_payroll_profiles is
  'Directorio gerencial de trabajadores con identificacion y tarifa vigente.';
