-- Perfil propio: teléfono central, fotografía gerencial central y solicitud de
-- cambio de correo pendiente.
--
-- * El teléfono vive solo aquí (fuente única) y lo leen web y desktop por la API.
--   Se guarda normalizado en formato E.164 (+50688887777).
-- * La fotografía de perfil web se guarda en un bucket privado de Storage. Aquí
--   solo queda la ruta interna del objeto; nunca una URL ni el binario. Nunca se
--   usa para biometría ni para reportes.
-- * email_change_requested_at permite a la API observar (y auditar) cuándo una
--   solicitud de cambio de correo fue confirmada en Supabase Auth.
-- * El bucket no tiene políticas para anon/authenticated: solo la API (con su
--   clave privada de servidor) sube, borra y firma URLs de corta duración.

alter table app.user_profiles
  add column phone text,
  add column avatar_object_path text,
  add column avatar_updated_at timestamptz,
  add column email_change_requested_at timestamptz;

alter table app.user_profiles
  add constraint user_profiles_phone_e164_check
    check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  add constraint user_profiles_avatar_pair_check
    check ((avatar_object_path is null) = (avatar_updated_at is null)),
  add constraint user_profiles_avatar_path_check
    check (
      avatar_object_path is null
      or avatar_object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    );

comment on column app.user_profiles.phone is
  'Teléfono de contacto opcional del propio usuario, E.164. Fuente única para web y desktop.';
comment on column app.user_profiles.avatar_object_path is
  'Ruta interna en el bucket privado profile-photos ({organization}/{profile}/{uuid}.jpg). Nunca biometría.';
comment on column app.user_profiles.email_change_requested_at is
  'Momento de la última solicitud de cambio de correo aún no observada como confirmada.';

-- En bases locales de prueba sin Storage (PGlite) se omite el bucket.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('profile-photos', 'profile-photos', false, 524288, array['image/jpeg'])
    on conflict (id) do nothing;
  end if;
end
$$;
