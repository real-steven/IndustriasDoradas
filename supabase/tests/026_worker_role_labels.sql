-- Categorías laborales explícitas y datos ficticios del selector de personal.

do $$
declare
  operator_count integer;
  manager_count integer;
begin
  select count(*) into operator_count
  from app.workers
  where id between
      '37100000-0000-4000-8000-000000000001'::uuid
      and '37100000-0000-4000-8000-000000000010'::uuid
    and category = 'OPERARIO'
    and name !~ '^(OP|JF)[[:space:]]';

  if operator_count <> 10 then
    raise exception 'expected ten clean operator fixtures, found %', operator_count;
  end if;

  select count(*) into manager_count
  from app.workers
  where id between
      '37100000-0000-4000-8000-000000000011'::uuid
      and '37100000-0000-4000-8000-000000000015'::uuid
    and category = 'JEFE_PLANTA'
    and name !~ '^(OP|JF)[[:space:]]';

  if manager_count <> 5 then
    raise exception 'expected five clean manager fixtures, found %', manager_count;
  end if;

  if exists (
    select 1
    from app.workers
    where user_profile_id is not null
      and category <> 'JEFE_PLANTA'
  ) then
    raise exception 'linked plant managers must always use JEFE_PLANTA category';
  end if;

  if not exists (
    select 1
    from app.role_permissions
    join app.roles on roles.id = role_permissions.role_id
    join app.permissions on permissions.id = role_permissions.permission_id
    where roles.code = 'JEFE_EMPRESA'
      and permissions.code = 'workers.request'
  ) then
    raise exception 'company manager must be able to request an operator';
  end if;

  begin
    update app.workers
    set category = 'INVALID'
    where id = '37100000-0000-4000-8000-000000000001';
    raise exception 'invalid worker category must fail';
  exception
    when check_violation then
      null;
  end;
end;
$$;
