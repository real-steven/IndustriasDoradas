-- Expediente laboral unificado para gerencia.
-- El nombre laboral se mantiene sincronizado con la cuenta vinculada de un
-- jefe de planta. El correo de esta ficha es de contacto; no cambia el correo
-- de acceso de Supabase Auth.

create or replace view app.management_worker_payroll_profiles
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
  rate.effective_from_utc as rate_effective_from_utc,
  worker.user_profile_id,
  worker.email,
  worker.phone
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

revoke all on table app.management_worker_payroll_profiles
  from public, anon, authenticated, service_role;
grant select on table app.management_worker_payroll_profiles to service_role;

create function app.update_worker_profile_v1(
  target_organization_id uuid,
  target_worker_id uuid,
  worker_name text,
  worker_identity_number text,
  worker_email text,
  worker_phone text
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  linked_profile_id uuid;
begin
  update app.workers
  set
    name = btrim(worker_name),
    identity_number = nullif(btrim(worker_identity_number), ''),
    email = nullif(btrim(worker_email), ''),
    phone = nullif(btrim(worker_phone), '')
  where organization_id = target_organization_id
    and id = target_worker_id
  returning user_profile_id into linked_profile_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'WORKER_NOT_FOUND';
  end if;

  if linked_profile_id is not null then
    update app.user_profiles
    set display_name = btrim(worker_name)
    where organization_id = target_organization_id
      and id = linked_profile_id;
  end if;
end;
$$;

revoke all on function app.update_worker_profile_v1(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function app.update_worker_profile_v1(uuid, uuid, text, text, text, text)
  to service_role;

create function app.set_worker_management_state_v1(
  target_organization_id uuid,
  target_worker_id uuid,
  governor_profile_id uuid,
  worker_active boolean,
  governance_reason text,
  governance_moment timestamptz
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  linked_profile_id uuid;
begin
  select user_profile_id
  into linked_profile_id
  from app.workers
  where organization_id = target_organization_id
    and id = target_worker_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'WORKER_NOT_FOUND';
  end if;

  if not worker_active and btrim(coalesce(governance_reason, '')) = '' then
    raise exception using errcode = '23514', message = 'SUSPENSION_REASON_REQUIRED';
  end if;

  if linked_profile_id is not null then
    perform app.govern_account(
      target_organization_id,
      linked_profile_id,
      governor_profile_id,
      case when worker_active then 'REACTIVATE' else 'SUSPEND' end,
      case when worker_active then null else btrim(governance_reason) end,
      governance_moment
    );
  end if;

  update app.workers
  set
    is_active = worker_active,
    deactivated_at = case when worker_active then null else governance_moment end
  where organization_id = target_organization_id
    and id = target_worker_id;
end;
$$;

revoke all on function app.set_worker_management_state_v1(uuid, uuid, uuid, boolean, text, timestamptz)
  from public, anon, authenticated;
grant execute on function app.set_worker_management_state_v1(uuid, uuid, uuid, boolean, text, timestamptz)
  to service_role;

comment on function app.update_worker_profile_v1(uuid, uuid, text, text, text, text) is
  'Actualiza la ficha laboral y sincroniza el nombre visible de la cuenta vinculada.';
comment on function app.set_worker_management_state_v1(uuid, uuid, uuid, boolean, text, timestamptz) is
  'Suspende o reactiva una ficha laboral y, si corresponde, su cuenta de jefe de planta en la misma transacción.';
