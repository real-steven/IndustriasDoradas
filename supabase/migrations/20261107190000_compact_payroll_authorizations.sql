-- Pre-nomina compacta: comentarios sin efecto monetario y autorizaciones
-- append-only del monto bruto por trabajador y periodo.

alter table app.payroll_adjustments
  drop constraint payroll_adjustments_type_check,
  drop constraint payroll_adjustments_value_check;

alter table app.payroll_adjustments
  add constraint payroll_adjustments_type_check check (
    adjustment_type in (
      'PAID_LEAVE_HOURS',
      'OVERTIME_HOURS',
      'HOLIDAY_HOURS',
      'REST_DAY_HOURS',
      'ABSENCE_HOURS',
      'EARLY_DEPARTURE_HOURS',
      'OTHER_COMMENT',
      'OTHER_EARNING',
      'OTHER_DEDUCTION'
    )
  ),
  add constraint payroll_adjustments_value_check check (
    (
      adjustment_type in ('OTHER_EARNING', 'OTHER_DEDUCTION')
      and minutes is null
      and amount_crc > 0
    )
    or (
      adjustment_type not in ('OTHER_EARNING', 'OTHER_DEDUCTION')
      and amount_crc is null
      and (minutes is null or minutes > 0)
    )
  );

create table app.payroll_gross_authorizations (
  id uuid primary key,
  organization_id uuid not null,
  worker_id uuid not null,
  from_date date not null,
  to_date date not null,
  authorized_amount_crc numeric(14, 2) not null,
  reason text not null,
  recorded_by_profile_id uuid not null,
  recorded_at_utc timestamptz not null default now(),
  constraint payroll_gross_authorizations_organization_id_id_unique
    unique (organization_id, id),
  constraint payroll_gross_authorizations_worker_fk
    foreign key (organization_id, worker_id)
    references app.workers (organization_id, id) on delete restrict,
  constraint payroll_gross_authorizations_profile_fk
    foreign key (organization_id, recorded_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint payroll_gross_authorizations_period_check
    check (to_date >= from_date),
  constraint payroll_gross_authorizations_amount_check
    check (authorized_amount_crc >= 0),
  constraint payroll_gross_authorizations_reason_check
    check (btrim(reason) <> '')
);

create index ix_payroll_gross_authorizations_worker_period
  on app.payroll_gross_authorizations (
    organization_id,
    worker_id,
    from_date,
    to_date,
    recorded_at_utc desc,
    id
  );

create index ix_payroll_gross_authorizations_profile_fk
  on app.payroll_gross_authorizations (
    organization_id,
    recorded_by_profile_id
  );

create trigger trg_payroll_gross_authorizations_append_only
before update or delete on app.payroll_gross_authorizations
for each row execute function app.reject_attendance_history_mutation_v1();

alter table app.payroll_gross_authorizations enable row level security;

create policy backend_service_all on app.payroll_gross_authorizations
  for all to service_role using (true) with check (true);

create view app.management_payroll_gross_authorizations
with (security_invoker = true)
as
select
  gross_authorization.id,
  gross_authorization.organization_id,
  gross_authorization.worker_id,
  gross_authorization.from_date,
  gross_authorization.to_date,
  gross_authorization.authorized_amount_crc,
  gross_authorization.reason,
  gross_authorization.recorded_by_profile_id,
  profile.display_name as recorded_by_name,
  gross_authorization.recorded_at_utc
from app.payroll_gross_authorizations as gross_authorization
join app.user_profiles as profile
  on profile.organization_id = gross_authorization.organization_id
 and profile.id = gross_authorization.recorded_by_profile_id;

revoke all on table app.payroll_gross_authorizations
  from public, anon, authenticated, service_role;
revoke all on table app.management_payroll_gross_authorizations
  from public, anon, authenticated, service_role;
grant select, insert on table app.payroll_gross_authorizations to service_role;
grant select on table app.management_payroll_gross_authorizations to service_role;

comment on table app.payroll_gross_authorizations is
  'Autorizaciones append-only del monto bruto por trabajador y rango exacto; la ultima decision es la vigente.';
comment on table app.payroll_adjustments is
  'Comentarios append-only de jornada. Se conservan por trazabilidad y no modifican automaticamente el monto bruto.';
