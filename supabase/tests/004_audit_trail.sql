-- Prueba de insercion segura, privilegios minimos e inmutabilidad de auditoria.

insert into auth.users (id, email)
values (
  '94000000-0000-4000-8000-000000000001',
  'audit-manager@example.invalid'
);

insert into app.user_profiles (
  id,
  organization_id,
  auth_user_id,
  role_id,
  display_name,
  account_status
)
select
  '94000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  roles.id,
  'Audit manager ficticio',
  'ACTIVE'
from app.roles
where roles.code = 'ADMINISTRADOR';

set role service_role;

insert into app.audit_events (
  id,
  organization_id,
  actor_kind,
  actor_profile_id,
  actor_auth_user_id,
  actor_display_name,
  actor_role_code,
  origin,
  action,
  entity_type,
  entity_id,
  occurred_at,
  correlation_id,
  result,
  reason_code,
  evidence_state,
  changed_fields,
  changes,
  request_method,
  request_path
) values (
  '94000000-0000-4000-8000-000000000010',
  '30000000-0000-4000-8000-000000000001',
  'AUTHENTICATED_USER',
  '94000000-0000-4000-8000-000000000002',
  '94000000-0000-4000-8000-000000000001',
  'Audit manager ficticio',
  'ADMINISTRADOR',
  'API',
  'account.status.change',
  'user_profile',
  '94000000-0000-4000-8000-000000000002',
  now(),
  '94000000-0000-4000-8000-000000000020',
  'SUCCEEDED',
  null,
  'NOT_APPLICABLE',
  array['account_status'],
  '{"account_status":{"before":"PENDING_APPROVAL","after":"ACTIVE"}}',
  'PATCH',
  '/api/v1/accounts/example'
);

do $$
begin
  if not exists (
    select 1
    from app.audit_events
    where id = '94000000-0000-4000-8000-000000000010'
      and result = 'SUCCEEDED'
      and changes -> 'account_status' ->> 'after' = 'ACTIVE'
  ) then
    raise exception 'safe audit event was not stored';
  end if;

  if has_table_privilege('service_role', 'app.audit_events', 'update')
     or has_table_privilege('service_role', 'app.audit_events', 'delete') then
    raise exception 'service_role must not update or delete audit events';
  end if;

  begin
    insert into app.audit_events (
      id,
      actor_kind,
      origin,
      action,
      entity_type,
      occurred_at,
      correlation_id,
      result,
      changed_fields,
      changes
    ) values (
      '94000000-0000-4000-8000-000000000011',
      'SYSTEM',
      'SYSTEM',
      'security.test',
      'audit_event',
      now(),
      '94000000-0000-4000-8000-000000000021',
      'FAILED',
      array['password'],
      '{"password":{"before":null,"after":"forbidden"}}'
    );
    raise exception 'sensitive audit change must be rejected';
  exception
    when check_violation then
      null;
  end;
end;
$$;

reset role;

do $$
begin
  begin
    update app.audit_events
    set result = 'FAILED'
    where id = '94000000-0000-4000-8000-000000000010';
    raise exception 'database owner must not silently update audit events';
  exception
    when object_not_in_prerequisite_state then
      null;
  end;

  begin
    delete from app.audit_events
    where id = '94000000-0000-4000-8000-000000000010';
    raise exception 'database owner must not silently delete audit events';
  exception
    when object_not_in_prerequisite_state then
      null;
  end;
end;
$$;
