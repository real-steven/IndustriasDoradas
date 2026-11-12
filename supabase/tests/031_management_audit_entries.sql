-- Auditoría gerencial clasificada: área, tipo de acción, persona y rutina.
-- Reutiliza la corrección de salida de la prueba 019 y el trabajador del seed.

reset role;

insert into app.audit_events (
  id, organization_id, actor_kind, actor_display_name, origin, action,
  entity_type, entity_id, occurred_at, correlation_id, result, evidence_state,
  changed_fields, changes
) values
  ('97000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001', 'AUTHENTICATED_USER',
   'Jefe ficticio', 'SYNC', 'attendance.correct', 'attendance_event',
   'f6100000-0000-4000-8000-000000000002', '2026-10-15T20:05:02Z',
   '97100000-0000-4000-8000-000000000001', 'SUCCEEDED', 'NOT_APPLICABLE',
   '{}', '{}'),
  ('97000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000001', 'AUTHENTICATED_USER',
   'Jefe ficticio', 'DESKTOP', 'station.security', 'station_security_event',
   null, '2026-10-15T21:00:00Z', '97100000-0000-4000-8000-000000000002',
   'SUCCEEDED', 'NOT_APPLICABLE', '{security_event,access_method}',
   '{"security_event": {"before": null, "after": "ELEVATION_ACCEPTED"},
     "access_method": {"before": null, "after": "BIOMETRIC"}}'),
  ('97000000-0000-4000-8000-000000000003',
   '30000000-0000-4000-8000-000000000001', 'AUTHENTICATED_USER',
   'Jefe ficticio', 'DESKTOP', 'station.security', 'station_security_event',
   null, '2026-10-15T21:01:00Z', '97100000-0000-4000-8000-000000000003',
   'SUCCEEDED', 'NOT_APPLICABLE', '{security_event}',
   '{"security_event": {"before": null, "after": "BIOMETRIC_REJECTED"}}'),
  ('97000000-0000-4000-8000-000000000004',
   '30000000-0000-4000-8000-000000000001', 'AUTHENTICATED_USER',
   'Gerencia ficticia', 'API', 'access.api', 'api_endpoint', null,
   '2026-10-15T21:02:00Z', '97100000-0000-4000-8000-000000000004',
   'SUCCEEDED', 'NOT_APPLICABLE', '{}', '{}'),
  ('97000000-0000-4000-8000-000000000005',
   '30000000-0000-4000-8000-000000000001', 'AUTHENTICATED_USER',
   'Gerencia ficticia', 'API', 'account.governance', 'user_profile', null,
   '2026-10-15T21:03:00Z', '97100000-0000-4000-8000-000000000005',
   'SUCCEEDED', 'NOT_APPLICABLE', '{account_status}',
   '{"account_status": {"before": "ACTIVE", "after": "SUSPENDED"}}'),
  ('97000000-0000-4000-8000-000000000006',
   '30000000-0000-4000-8000-000000000001', 'AUTHENTICATED_USER',
   'Gerencia ficticia', 'WEB', 'business.mutation', 'shipment', null,
   '2026-10-15T21:04:00Z', '97100000-0000-4000-8000-000000000006',
   'SUCCEEDED', 'NOT_APPLICABLE', '{gold_amount_grams}',
   '{"gold_amount_grams": {"before": null, "after": 3.5}}'),
  ('97000000-0000-4000-8000-000000000007',
   '30000000-0000-4000-8000-000000000001', 'AUTHENTICATED_USER',
   'Jefe ficticio', 'SYNC', 'sync.ingest', 'production_event', null,
   '2026-10-15T21:05:00Z', '97100000-0000-4000-8000-000000000007',
   'SUCCEEDED', 'NOT_APPLICABLE', '{}', '{}');

do $$
declare
  entry record;
begin
  for entry in
    select *
    from app.management_audit_entries
    where id::text like '97000000-0000-4000-8000-%'
  loop
    if entry.id = '97000000-0000-4000-8000-000000000001' and (
      entry.audit_area <> 'people'
      or entry.audit_kind <> 'ATTENDANCE_CHECK_OUT_CORRECTED'
      or entry.subject_worker_id <> 'b1000000-0000-4000-8000-000000000001'
      or entry.subject_name is null
      or entry.subject_occurred_at_utc <> '2026-10-15T20:00:00Z'
      or entry.is_routine
    ) then
      raise exception 'attendance correction must name the person: %', row_to_json(entry);
    elsif entry.id = '97000000-0000-4000-8000-000000000002' and (
      entry.audit_area <> 'security' or entry.audit_kind <> 'ELEVATION_BIOMETRIC'
    ) then
      raise exception 'biometric elevation misclassified: %', row_to_json(entry);
    elsif entry.id = '97000000-0000-4000-8000-000000000003' and (
      entry.audit_area <> 'security' or entry.audit_kind <> 'SECURITY_REJECTED'
    ) then
      raise exception 'biometric rejection misclassified: %', row_to_json(entry);
    elsif entry.id = '97000000-0000-4000-8000-000000000004' and (
      entry.audit_area is not null or not entry.is_routine
    ) then
      raise exception 'API access must be routine without area: %', row_to_json(entry);
    elsif entry.id = '97000000-0000-4000-8000-000000000005' and (
      entry.audit_area <> 'people' or entry.audit_kind <> 'USER_SUSPENDED'
    ) then
      raise exception 'suspension misclassified: %', row_to_json(entry);
    elsif entry.id = '97000000-0000-4000-8000-000000000006' and (
      entry.audit_area <> 'administration' or entry.audit_kind <> 'GOLD_RESULT'
    ) then
      raise exception 'gold result misclassified: %', row_to_json(entry);
    elsif entry.id = '97000000-0000-4000-8000-000000000007' and (
      entry.audit_area <> 'operation'
      or entry.audit_kind <> 'CAJUELA_RECORDED'
      or not entry.is_routine
    ) then
      raise exception 'individual cajuelas must stay routine: %', row_to_json(entry);
    end if;
  end loop;

  if (
    select count(*)
    from app.management_audit_entries
    where id::text like '97000000-0000-4000-8000-%'
  ) <> 7 then
    raise exception 'the classified view must keep every audit fact';
  end if;

  if has_table_privilege('anon', 'app.management_audit_entries', 'select')
     or has_table_privilege('authenticated', 'app.management_audit_entries', 'select') then
    raise exception 'management audit entries must stay server-only';
  end if;
end;
$$;
