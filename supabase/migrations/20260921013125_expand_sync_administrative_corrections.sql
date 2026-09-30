create or replace function app.capture_administrative_correction_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  sequence_value bigint;
begin
  if new.organization_id is null
     or new.actor_kind <> 'AUTHENTICATED_USER'
     or new.result <> 'SUCCEEDED'
     or new.changes = '{}'::jsonb then
    return new;
  end if;

  sequence_value := nextval('app.sync_changes_server_sequence_seq');
  insert into app.sync_changes (
    change_id, server_sequence, organization_id, plant_id, station_id,
    entity_type, entity_id, entity_version, action, changed_at_utc,
    payload_schema_version, payload
  ) values (
    gen_random_uuid(), sequence_value, new.organization_id, null, new.station_id,
    'ADMINISTRATIVE_CORRECTION', new.id, sequence_value, 'CORRECTION_APPENDED',
    new.occurred_at, 1,
    jsonb_build_object(
      'audit_event_id', new.id,
      'administrator', coalesce(new.actor_display_name, 'Administrador'),
      'role_code', coalesce(new.actor_role_code, 'ROL_NO_INDICADO'),
      'reason_code', coalesce(new.reason_code, 'CAMBIO_ADMINISTRATIVO'),
      'event_action', new.action,
      'target_entity_type', new.entity_type,
      'target_entity_id', new.entity_id,
      'occurred_at_utc', new.occurred_at,
      'changes', new.changes
    )
  );
  return new;
end;
$$;
