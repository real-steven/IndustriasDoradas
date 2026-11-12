-- Perfil propio: teléfono E.164 opcional y referencia de foto privada coherente.
-- Usa el perfil gerencial de la semilla y deshace sus cambios.

do $$
declare
  target uuid;
begin
  select id into target from app.user_profiles order by created_at limit 1;
  if target is null then
    raise exception 'seed must contain at least one profile';
  end if;

  update app.user_profiles set phone = '+50688887777' where id = target;
  update app.user_profiles set phone = null where id = target;

  begin
    update app.user_profiles set phone = '8888-7777' where id = target;
    raise exception 'non E.164 phone must be rejected';
  exception when check_violation then null;
  end;

  begin
    update app.user_profiles
      set avatar_object_path = 'x.jpg', avatar_updated_at = now()
      where id = target;
    raise exception 'avatar path outside {org}/{profile}/{uuid}.jpg must be rejected';
  exception when check_violation then null;
  end;

  begin
    update app.user_profiles
      set avatar_object_path = '30000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000001.jpg'
      where id = target;
    raise exception 'avatar path without timestamp must be rejected';
  exception when check_violation then null;
  end;
end
$$;
