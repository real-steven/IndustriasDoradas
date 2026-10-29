-- Categoría laboral explícita para identificar operarios y jefes de planta
-- sin alterar el nombre legal o visible almacenado del trabajador.

alter table app.workers
  add column category text not null default 'OPERARIO';

update app.workers
set category = 'JEFE_PLANTA'
where user_profile_id is not null;

alter table app.workers
  add constraint workers_category_check
  check (category in ('OPERARIO', 'JEFE_PLANTA'));

alter table app.workers
  add constraint workers_linked_profile_category_check
  check (user_profile_id is null or category = 'JEFE_PLANTA');

create index ix_workers_category_active_name
  on app.workers (organization_id, category, is_active, name);

comment on column app.workers.category is
  'Categoría laboral canónica. El prefijo OP/JF se deriva en presentación y nunca se concatena al nombre.';

create function app.assign_linked_worker_category_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.user_profile_id is not null then
    new.category := 'JEFE_PLANTA';
  end if;
  return new;
end;
$$;

revoke all on function app.assign_linked_worker_category_v1()
  from public, anon, authenticated;
grant execute on function app.assign_linked_worker_category_v1()
  to service_role;

create trigger trg_workers_assign_linked_category
before insert or update of user_profile_id, category on app.workers
for each row execute function app.assign_linked_worker_category_v1();

-- Gerencia puede registrar operarios desde el formulario web unificado.
insert into app.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from app.roles
join app.permissions on permissions.code = 'workers.request'
where roles.code = 'JEFE_EMPRESA'
on conflict (role_id, permission_id) do nothing;
