-- Correccion compatible de 3.2/3.3: conserva recibos y migraciones anteriores.
-- La funcion interna sigue siendo la autoridad transaccional de negocio/auditoria.
create or replace function app.ingest_sync_item_v1(input_item jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  organization_id_value uuid := (input_item ->> 'organizationId')::uuid;
  station_id_value uuid := (input_item ->> 'stationId')::uuid;
  outbox_message_id_value uuid := (input_item ->> 'outboxMessageId')::uuid;
  station_sequence_value bigint := (input_item ->> 'stationSequence')::bigint;
  payload jsonb := input_item -> 'payload';
  operation_type_value text := input_item ->> 'operationType';
  dependency_id uuid;
  dependency_operation text;
  expected_worker_id uuid;
  working_item jsonb := input_item;
  constraint_name_value text;
  error_code text;
  sequence_processed_at timestamptz;
  lock_key text;
begin
  lock_key := organization_id_value::text || ':' || station_id_value::text
    || ':' || outbox_message_id_value::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_key, 0));

  -- Un recibo anterior siempre prevalece, incluso si ahora falta una dependencia.
  if exists (
    select 1 from app.sync_receipts
    where organization_id = organization_id_value
      and station_id = station_id_value
      and outbox_message_id = outbox_message_id_value
  ) then
    return app.ingest_sync_item_v1_unlocked(input_item);
  end if;

  -- Serializa tambien UUID distintos que pretenden ocupar la misma secuencia.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id_value::text || ':' || station_id_value::text
      || ':sequence:' || station_sequence_value::text, 0
  ));
  select processed_at_utc into sequence_processed_at
  from app.sync_receipts
  where organization_id = organization_id_value
    and station_id = station_id_value
    and station_sequence = station_sequence_value;
  if found then
    -- No se puede insertar otro recibo para la secuencia reservada. Tampoco se
    -- entrega el receiptId ajeno como confirmacion del mensaje que colisiono.
    return jsonb_build_object(
      'outboxMessageId', outbox_message_id_value,
      'stationSequence', station_sequence_value,
      'status', 'FAILED_REVIEW',
      'code', 'STATION_SEQUENCE_CONFLICT',
      'processedAtUtc', sequence_processed_at
    );
  end if;

  -- Solo difiere elementos validos cuyo antecedente operativo aun no existe.
  -- Catalogos ausentes y referencias existentes incompatibles siguen siendo
  -- rechazos de negocio. Los filtros no consultan recibos de otra estacion.
  if nullif(input_item ->> 'precheckCode', '') is null
    and input_item #>> '{authorization,stateAtCapture}' = 'VALID'
    and exists (
      select 1 from app.station_user_authorizations
      where organization_id = organization_id_value
        and plant_id = (input_item ->> 'plantId')::uuid
        and station_id = station_id_value
        and user_profile_id = (input_item #>> '{authorization,actorProfileId}')::uuid
    )
  then
    if operation_type_value in (
      'RESPONSIBLE_RELIEVED', 'OPERATION_COMPLETED', 'PRODUCTION_EVENT_CREATED'
    ) and not exists (
      select 1 from app.shipments
      where organization_id = organization_id_value
        and id = (payload ->> 'shipmentId')::uuid
    ) then
      dependency_id := (payload ->> 'shipmentId')::uuid;
      dependency_operation := 'OPERATION_STARTED';
    elsif operation_type_value = 'PRODUCTION_EVENT_CREATED'
      and payload ->> 'eventType' = 'CAJUELA_REVERSED'
      and not exists (
        select 1 from app.production_events
        where organization_id = organization_id_value
          and id = (payload ->> 'reversesClientEventId')::uuid
      )
    then
      dependency_id := (payload ->> 'reversesClientEventId')::uuid;
      dependency_operation := 'PRODUCTION_EVENT_CREATED';
    end if;

    if dependency_id is null and operation_type_value in (
      'RESPONSIBLE_RELIEVED', 'OPERATION_COMPLETED', 'PRODUCTION_EVENT_CREATED'
    ) then
      expected_worker_id := case when operation_type_value = 'RESPONSIBLE_RELIEVED'
        then (payload ->> 'previousResponsibleWorkerId')::uuid
        else (payload ->> 'responsibleWorkerId')::uuid end;
      if exists (
        select 1 from app.shipments
        where organization_id = organization_id_value
          and station_id = station_id_value
          and id = (payload ->> 'shipmentId')::uuid
          and production_line_id = (payload ->> 'lineId')::uuid
          and feed_cycle_id = (payload ->> 'feedCycleId')::uuid
          and started_at_utc <= (payload ->> 'occurredAtUtc')::timestamptz
          and (completed_at_utc is null or (
            operation_type_value = 'PRODUCTION_EVENT_CREATED'
            and completed_at_utc >= (payload ->> 'occurredAtUtc')::timestamptz
          ))
      ) and exists (
        select 1 from app.workers
        where organization_id = organization_id_value
          and plant_id = (input_item ->> 'plantId')::uuid
          and id = expected_worker_id
      ) and not exists (
        select 1 from app.responsibility_assignments
        where organization_id = organization_id_value
          and shipment_id = (payload ->> 'shipmentId')::uuid
          and worker_id = expected_worker_id
          and started_at_utc <= (payload ->> 'occurredAtUtc')::timestamptz
          and (ended_at_utc is null or (
            operation_type_value = 'PRODUCTION_EVENT_CREATED'
            and ended_at_utc >= (payload ->> 'occurredAtUtc')::timestamptz
          ))
      ) then
        dependency_id := (payload ->> 'shipmentId')::uuid;
        -- El recibo de relevo solo identifica el cargamento: no permite saber
        -- si un relevo rechazado era el que asignaba a este trabajador.
        -- No convertir esa ambiguedad en un rechazo terminal.
        dependency_operation := null;
      end if;
    end if;

    if dependency_id is not null then
      if exists (
        select 1 from app.sync_receipts
        where organization_id = organization_id_value
          and station_id = station_id_value
          and aggregate_id = dependency_id
          and operation_type = dependency_operation
          and station_sequence < station_sequence_value
          and terminal_status = 'FAILED_REVIEW'
      ) then
        working_item := input_item || jsonb_build_object('precheckCode', 'DEPENDENCY_REJECTED');
      else
        -- Sin recibo terminal ni auditoria falsa de rechazo: el mismo UUID
        -- podra aplicarse cuando llegue su inicio o la cajuela que revierte.
        return jsonb_build_object(
          'outboxMessageId', outbox_message_id_value,
          'stationSequence', station_sequence_value,
          'status', 'RETRY_LATER',
          'code', 'DEPENDENCY_NOT_READY',
          'processedAtUtc', (input_item ->> 'processedAtUtc')::timestamptz
        );
      end if;
    end if;
  end if;

  begin
    return app.ingest_sync_item_v1_unlocked(working_item);
  exception when integrity_constraint_violation or data_exception then
    -- Este subbloque revierte TODO el efecto del intento antes de conservar
    -- un rechazo. Deadlocks, serializacion y fallos de red no se capturan aqui.
    get stacked diagnostics constraint_name_value = CONSTRAINT_NAME;
    error_code := case
      when constraint_name_value = 'production_events_station_client_sequence_unique'
        then 'PRODUCTION_SEQUENCE_CONFLICT'
      when constraint_name_value = 'ux_production_events_reversal_target'
        then 'REVERSAL_CONFLICT'
      when sqlstate like '22%' then 'INVALID_EVENT'
      else 'DATABASE_CONSTRAINT_VIOLATION'
    end;
    return app.ingest_sync_item_v1_unlocked(
      input_item || jsonb_build_object('precheckCode', error_code)
    );
  end;
end;
$$;

revoke all on function app.ingest_sync_item_v1(jsonb) from public, anon, authenticated;
grant execute on function app.ingest_sync_item_v1(jsonb) to service_role;

comment on function app.ingest_sync_item_v1(jsonb) is
  'Ingesta serializada por UUID y secuencia; dependencias pendientes reintentables y conflictos permanentes aislados.';
