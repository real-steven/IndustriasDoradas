-- Sprint 7.10.4: categorías iniciales y novedad reconstruida.

do $$
declare
  novelty app.management_operational_novelties%rowtype;
begin
  if (
    select count(*)
    from app.operational_novelty_categories
    where organization_id = '30000000-0000-4000-8000-000000000001'
      and code in ('PARO', 'MANTENIMIENTO', 'EMERGENCIA', 'FERIADO', 'OTRO')
  ) <> 5 then
    raise exception 'every organization must receive the five initial novelty categories';
  end if;

  select * into strict novelty
  from app.management_operational_novelties
  where organization_id = '30000000-0000-4000-8000-000000000001'
    and novelty_id = '77700000-0000-4000-8000-000000000001';

  if novelty.is_open
     or novelty.duration_minutes <> 105
     or novelty.line_name <> 'Linea ficticia 1'
     or novelty.opened_by_display_name is null
     or novelty.closed_by_display_name is null then
    raise exception 'management novelty must preserve scope, actors and 105-minute duration';
  end if;

  if pg_catalog.has_table_privilege(
       'authenticated', 'app.management_operational_novelties', 'select'
     ) or pg_catalog.has_table_privilege(
       'anon', 'app.management_operational_novelties', 'select'
     ) then
    raise exception 'browser roles must not access operational novelty view';
  end if;
  if not pg_catalog.has_table_privilege(
       'service_role', 'app.management_operational_novelties', 'select'
     ) then
    raise exception 'backend service must read operational novelty view';
  end if;
end;
$$;
