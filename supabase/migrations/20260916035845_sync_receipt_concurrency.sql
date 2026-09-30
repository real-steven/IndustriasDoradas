-- Serializa cada clave idempotente durante toda la transaccion. La restriccion
-- unica sigue siendo la ultima defensa, pero las solicitudes concurrentes con
-- el mismo mensaje ya no compiten por insertar el efecto ni el recibo.

drop index app.ix_sync_receipts_station_sequence;
alter table app.sync_receipts
  add constraint sync_receipts_station_sequence_unique
  unique (organization_id, station_id, station_sequence);

alter table app.production_events
  add constraint production_events_station_client_sequence_unique
  unique (organization_id, station_id, client_sequence);

drop index app.ix_production_events_reversal_target;
create unique index ux_production_events_reversal_target
  on app.production_events (organization_id, reverses_client_event_id)
  where reverses_client_event_id is not null;

alter function app.ingest_sync_item_v1(jsonb)
  rename to ingest_sync_item_v1_unlocked;

revoke all on function app.ingest_sync_item_v1_unlocked(jsonb) from public;
revoke all on function app.ingest_sync_item_v1_unlocked(jsonb) from anon;
revoke all on function app.ingest_sync_item_v1_unlocked(jsonb) from authenticated;
grant execute on function app.ingest_sync_item_v1_unlocked(jsonb) to service_role;

create function app.ingest_sync_item_v1(input_item jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  organization_id_value uuid := (input_item ->> 'organizationId')::uuid;
  station_id_value uuid := (input_item ->> 'stationId')::uuid;
  outbox_message_id_value uuid := (input_item ->> 'outboxMessageId')::uuid;
  lock_key text;
begin
  lock_key := organization_id_value::text
    || ':' || station_id_value::text
    || ':' || outbox_message_id_value::text;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(lock_key, 0)
  );

  return app.ingest_sync_item_v1_unlocked(input_item);
end;
$$;

revoke all on function app.ingest_sync_item_v1(jsonb) from public;
revoke all on function app.ingest_sync_item_v1(jsonb) from anon;
revoke all on function app.ingest_sync_item_v1(jsonb) from authenticated;
grant execute on function app.ingest_sync_item_v1(jsonb) to service_role;

comment on function app.ingest_sync_item_v1_unlocked(jsonb) is
  'Implementacion interna; solo debe invocarse desde el wrapper con bloqueo transaccional.';
comment on function app.ingest_sync_item_v1(jsonb) is
  'Serializa por organizacion, estacion y outboxMessageId antes de aplicar un elemento.';
comment on table app.sync_receipts is
  'Recibos durables e idempotentes del push, protegidos frente a carreras concurrentes.';
