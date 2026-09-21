-- Verifica que un cambio administrativo seguro se publique como corrección auditable.

do $$
declare
  before_count integer;
  correction record;
begin
  select count(*) into before_count
  from app.sync_changes
  where entity_type = 'ADMINISTRATIVE_CORRECTION';

  insert into app.audit_events (
    id, organization_id, actor_kind, actor_profile_id, actor_auth_user_id,
    actor_display_name, actor_role_code, origin, action, entity_type, entity_id,
    occurred_at, correlation_id, result, reason_code, changed_fields, changes,
    request_method, request_path
  ) values (
    'f3000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'AUTHENTICATED_USER',
    'a1000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002',
    'Jefe de planta ficticio',
    'JEFE_PLANTA',
    'API',
    'business.mutation',
    'supplier',
    '35000000-0000-4000-8000-000000000001',
    '2026-09-20T23:10:00Z',
    'f3100000-0000-4000-8000-000000000001',
    'SUCCEEDED',
    'CAMBIO_AUTORIZADO',
    array['name'],
    '{"name":{"before":"Proveedor anterior","after":"Proveedor corregido"}}'::jsonb,
    'PATCH',
    '/api/v1/organizations/30000000-0000-4000-8000-000000000001/catalogs/suppliers/35000000-0000-4000-8000-000000000001'
  );

  if (
    select count(*)
    from app.sync_changes
    where entity_type = 'ADMINISTRATIVE_CORRECTION'
  ) <> before_count + 1 then
    raise exception 'successful administrative change must append one correction';
  end if;

  select action, entity_id, payload
    into correction
  from app.sync_changes
  where entity_type = 'ADMINISTRATIVE_CORRECTION'
  order by server_sequence desc
  limit 1;

  if correction.action <> 'CORRECTION_APPENDED'
     or correction.entity_id <> 'f3000000-0000-4000-8000-000000000001'
     or correction.payload ->> 'administrator' <> 'Jefe de planta ficticio'
     or correction.payload ->> 'reason_code' <> 'CAMBIO_AUTORIZADO'
     or correction.payload #>> '{changes,name,after}' <> 'Proveedor corregido' then
    raise exception 'correction payload must preserve safe audit context';
  end if;

  insert into app.audit_events (
    id, organization_id, actor_kind, actor_profile_id, actor_auth_user_id,
    actor_display_name, actor_role_code, origin, action, entity_type, entity_id,
    occurred_at, correlation_id, result, reason_code, changed_fields, changes
  ) values (
    'f3000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    'AUTHENTICATED_USER',
    'a1000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002',
    'Jefe de planta ficticio',
    'JEFE_PLANTA',
    'API',
    'business.mutation',
    'supplier',
    '35000000-0000-4000-8000-000000000001',
    '2026-09-20T23:11:00Z',
    'f3100000-0000-4000-8000-000000000002',
    'REJECTED',
    'BUSINESS_RULE_REJECTED',
    array[]::text[],
    '{}'::jsonb
  );

  if (
    select count(*)
    from app.sync_changes
    where entity_type = 'ADMINISTRATIVE_CORRECTION'
  ) <> before_count + 1 then
    raise exception 'rejected or empty audit must not become a correction';
  end if;

  insert into app.audit_events (
    id, organization_id, actor_kind, actor_profile_id, actor_auth_user_id,
    actor_display_name, actor_role_code, origin, action, entity_type, entity_id,
    occurred_at, correlation_id, result, changed_fields, changes
  ) values (
    'f3000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    'AUTHENTICATED_USER',
    'a1000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002',
    'Jefe de planta ficticio',
    'JEFE_PLANTA',
    'API',
    'permission.governance',
    'user_profile_permissions',
    'a1000000-0000-4000-8000-000000000003',
    '2026-09-20T23:12:00Z',
    'f3100000-0000-4000-8000-000000000003',
    'SUCCEEDED',
    array['permission_count'],
    '{"permission_count":{"before":3,"after":4}}'::jsonb
  );

  if (
    select count(*)
    from app.sync_changes
    where entity_type = 'ADMINISTRATIVE_CORRECTION'
  ) <> before_count + 2 then
    raise exception 'successful permission governance must append one correction';
  end if;
end;
$$;
