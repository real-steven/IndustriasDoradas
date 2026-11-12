-- Los eventos de seguridad de estación usan la misma secuencia técnica central
-- que el resto de la sincronización multi-cliente (v2).
--
-- `ingest_station_security_sync_item_v1` se llamaba directamente y guardaba el
-- recibo con `station_sequence = client_sequence`. Las demás operaciones pasan
-- por `prepare_sync_client_instance_v2`, que les asigna un número de
-- `sync_receipt_storage_sequence_v2`. Cuando ese contador alcanzaba un número ya
-- ocupado por un evento de seguridad, la operación se rechazaba con
-- STATION_SEQUENCE_CONFLICT (por ejemplo, el cierre de un cargamento).
--
-- Esta migración:
-- 1. agrega el envoltorio v2 para eventos de seguridad, igual a los demás;
-- 2. adelanta la secuencia técnica por encima de todo número ya usado, para
--    que los recibos de seguridad existentes no vuelvan a chocar.
-- La función v1 se conserva para compatibilidad y para las pruebas existentes.

create function app.ingest_station_security_sync_item_v2(input_item jsonb)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, app as $$
declare
  conflict jsonb;
  original_sequence bigint := (input_item ->> 'stationSequence')::bigint;
  working_item jsonb;
  result jsonb;
begin
  conflict := app.prepare_sync_client_instance_v2(input_item);
  if conflict is not null then return conflict; end if;
  working_item := jsonb_set(
    input_item, '{payload,clientSequence}',
    to_jsonb(current_setting('app.sync_storage_sequence')::bigint), true
  ) || jsonb_build_object(
    'stationSequence', current_setting('app.sync_storage_sequence')::bigint
  );
  result := app.ingest_station_security_sync_item_v1(working_item);
  return result || jsonb_build_object('stationSequence', original_sequence);
end;
$$;

revoke all on function app.ingest_station_security_sync_item_v2(jsonb)
  from public, anon, authenticated;
grant execute on function app.ingest_station_security_sync_item_v2(jsonb)
  to service_role;

select pg_catalog.setval(
  'app.sync_receipt_storage_sequence_v2',
  greatest(
    (
      select case when is_called then last_value + 1 else last_value end
      from app.sync_receipt_storage_sequence_v2
    ),
    coalesce((select max(station_sequence) from app.sync_receipts), 0) + 1
  ),
  false
);
