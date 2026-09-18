-- Persistencia central mínima y RPC transaccional para el push del Sprint 3.2.
-- El pull, el worker desktop y el endurecimiento concurrente pertenecen a pasos posteriores.

create table app.shipments (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  station_id uuid not null,
  production_line_id uuid not null,
  supplier_id uuid not null,
  feed_cycle_id uuid not null,
  started_by_profile_id uuid not null,
  started_at_utc timestamptz not null,
  completed_at_utc timestamptz,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  constraint shipments_organization_id_id_unique unique (organization_id, id),
  constraint shipments_feed_cycle_unique unique (organization_id, feed_cycle_id),
  constraint shipments_station_fk
    foreign key (organization_id, plant_id, station_id)
    references app.stations (organization_id, plant_id, id) on delete restrict,
  constraint shipments_line_fk
    foreign key (organization_id, plant_id, production_line_id)
    references app.production_lines (organization_id, plant_id, id) on delete restrict,
  constraint shipments_supplier_fk
    foreign key (organization_id, supplier_id)
    references app.suppliers (organization_id, id) on delete restrict,
  constraint shipments_started_by_fk
    foreign key (organization_id, started_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint shipments_status_check check (status in ('ACTIVE', 'COMPLETED')),
  constraint shipments_completion_check check (
    (status = 'ACTIVE' and completed_at_utc is null)
    or (
      status = 'COMPLETED'
      and completed_at_utc is not null
      and completed_at_utc >= started_at_utc
    )
  )
);

create index ix_shipments_station_status
  on app.shipments (organization_id, station_id, status, started_at_utc desc);
create index ix_shipments_line_time
  on app.shipments (organization_id, production_line_id, started_at_utc desc);
create index ix_shipments_station_fk
  on app.shipments (organization_id, plant_id, station_id);
create index ix_shipments_line_fk
  on app.shipments (organization_id, plant_id, production_line_id);
create index ix_shipments_supplier
  on app.shipments (organization_id, supplier_id);
create index ix_shipments_started_by
  on app.shipments (organization_id, started_by_profile_id);

create table app.responsibility_assignments (
  id uuid primary key,
  organization_id uuid not null,
  shipment_id uuid not null,
  worker_id uuid not null,
  assigned_by_profile_id uuid not null,
  started_at_utc timestamptz not null,
  ended_at_utc timestamptz,
  created_at timestamptz not null default now(),
  constraint responsibility_assignments_organization_id_id_unique
    unique (organization_id, id),
  constraint responsibility_assignments_shipment_fk
    foreign key (organization_id, shipment_id)
    references app.shipments (organization_id, id) on delete restrict,
  constraint responsibility_assignments_worker_fk
    foreign key (organization_id, worker_id)
    references app.workers (organization_id, id) on delete restrict,
  constraint responsibility_assignments_assigned_by_fk
    foreign key (organization_id, assigned_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint responsibility_assignments_period_check
    check (ended_at_utc is null or ended_at_utc >= started_at_utc)
);

create index ix_responsibility_assignments_shipment_time
  on app.responsibility_assignments (
    organization_id,
    shipment_id,
    started_at_utc,
    ended_at_utc
  );
create index ix_responsibility_assignments_worker
  on app.responsibility_assignments (organization_id, worker_id);
create index ix_responsibility_assignments_assigned_by
  on app.responsibility_assignments (organization_id, assigned_by_profile_id);

create table app.production_events (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  station_id uuid not null,
  production_line_id uuid not null,
  feed_cycle_id uuid not null,
  shipment_id uuid not null,
  responsible_worker_id uuid not null,
  event_type text not null,
  work_period text not null,
  occurred_at_utc timestamptz not null,
  recorded_at_utc timestamptz not null,
  client_sequence bigint not null,
  quantity_delta integer not null,
  reverses_client_event_id uuid,
  confirmation_id uuid,
  reason_code text,
  prepared_at_utc timestamptz,
  input_source_kind text not null,
  input_controller_id text not null,
  input_signal_code text not null,
  input_line_slot integer not null,
  input_was_repeat boolean not null,
  authorization_profile_id uuid not null,
  authorization_permission_version integer not null,
  authorization_state text not null,
  created_at timestamptz not null default now(),
  constraint production_events_organization_id_id_unique unique (organization_id, id),
  constraint production_events_shipment_fk
    foreign key (organization_id, shipment_id)
    references app.shipments (organization_id, id) on delete restrict,
  constraint production_events_station_fk
    foreign key (organization_id, plant_id, station_id)
    references app.stations (organization_id, plant_id, id) on delete restrict,
  constraint production_events_line_fk
    foreign key (organization_id, plant_id, production_line_id)
    references app.production_lines (organization_id, plant_id, id) on delete restrict,
  constraint production_events_worker_fk
    foreign key (organization_id, responsible_worker_id)
    references app.workers (organization_id, id) on delete restrict,
  constraint production_events_authorization_profile_fk
    foreign key (organization_id, authorization_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint production_events_type_delta_check check (
    (event_type = 'CAJUELA_ADDED' and quantity_delta = 1)
    or (event_type = 'CAJUELA_REVERSED' and quantity_delta = -1)
  ),
  constraint production_events_reversal_check check (
    (
      event_type = 'CAJUELA_ADDED'
      and reverses_client_event_id is null
      and confirmation_id is null
      and reason_code is null
      and prepared_at_utc is null
    )
    or (
      event_type = 'CAJUELA_REVERSED'
      and reverses_client_event_id is not null
      and confirmation_id is not null
      and reason_code = 'IMMEDIATE_INPUT_ERROR'
      and prepared_at_utc is not null
      and occurred_at_utc >= prepared_at_utc
    )
  ),
  constraint production_events_work_period_check check (work_period in ('DAY', 'NIGHT')),
  constraint production_events_sequence_check check (client_sequence > 0),
  constraint production_events_line_slot_check check (input_line_slot between 1 and 4),
  constraint production_events_input_check check (
    btrim(input_source_kind) <> ''
    and btrim(input_controller_id) <> ''
    and btrim(input_signal_code) <> ''
  ),
  constraint production_events_authorization_version_check
    check (authorization_permission_version > 0),
  constraint production_events_authorization_state_check
    check (authorization_state in ('VALID', 'EXPIRED_CONTINGENCY', 'LEGACY_UNAVAILABLE')),
  constraint production_events_recorded_after_occurred_check
    check (recorded_at_utc >= occurred_at_utc)
);

create index ix_production_events_shipment_sequence
  on app.production_events (organization_id, shipment_id, client_sequence);
create index ix_production_events_station_time
  on app.production_events (organization_id, station_id, occurred_at_utc, id);
create index ix_production_events_line_time
  on app.production_events (organization_id, production_line_id, occurred_at_utc, id);
create index ix_production_events_station_fk
  on app.production_events (organization_id, plant_id, station_id);
create index ix_production_events_line_fk
  on app.production_events (organization_id, plant_id, production_line_id);
create index ix_production_events_worker
  on app.production_events (organization_id, responsible_worker_id);
create index ix_production_events_reversal_target
  on app.production_events (organization_id, reverses_client_event_id)
  where reverses_client_event_id is not null;
create index ix_production_events_authorization_profile
  on app.production_events (organization_id, authorization_profile_id);

create table app.sync_receipts (
  id uuid primary key,
  organization_id uuid not null,
  plant_id uuid not null,
  station_id uuid not null,
  outbox_message_id uuid not null,
  station_sequence bigint not null,
  content_hash text not null,
  operation_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  terminal_status text not null,
  result_code text not null,
  processed_at_utc timestamptz not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint sync_receipts_outbox_unique
    unique (organization_id, station_id, outbox_message_id),
  constraint sync_receipts_station_fk
    foreign key (organization_id, plant_id, station_id)
    references app.stations (organization_id, plant_id, id) on delete restrict,
  constraint sync_receipts_sequence_check check (station_sequence > 0),
  constraint sync_receipts_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint sync_receipts_status_check check (terminal_status in ('APPLIED', 'FAILED_REVIEW')),
  constraint sync_receipts_code_check check (
    result_code = upper(btrim(result_code))
    and result_code ~ '^[A-Z][A-Z0-9_]*$'
  )
);

create index ix_sync_receipts_station_sequence
  on app.sync_receipts (organization_id, station_id, station_sequence);
create index ix_sync_receipts_station_fk
  on app.sync_receipts (organization_id, plant_id, station_id);
create index ix_sync_receipts_aggregate
  on app.sync_receipts (organization_id, aggregate_type, aggregate_id);
create index ix_sync_receipts_correlation on app.sync_receipts (correlation_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'shipments',
    'responsibility_assignments',
    'production_events',
    'sync_receipts'
  ]
  loop
    execute format('alter table app.%I enable row level security', table_name);
    execute format(
      'create policy backend_service_all on app.%I for all to service_role using (true) with check (true)',
      table_name
    );
    execute format('revoke all on table app.%I from public', table_name);
    execute format('revoke all on table app.%I from anon', table_name);
    execute format('revoke all on table app.%I from authenticated', table_name);
  end loop;
end;
$$;

grant select, insert, update on table
  app.shipments,
  app.responsibility_assignments,
  app.production_events
to service_role;
grant select, insert on table app.sync_receipts to service_role;

create function app.ingest_sync_item_v1(input_item jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_receipt app.sync_receipts%rowtype;
  payload jsonb := input_item -> 'payload';
  authorization_data jsonb := input_item -> 'authorization';
  organization_id_value uuid := (input_item ->> 'organizationId')::uuid;
  plant_id_value uuid := (input_item ->> 'plantId')::uuid;
  station_id_value uuid := (input_item ->> 'stationId')::uuid;
  outbox_message_id_value uuid := (input_item ->> 'outboxMessageId')::uuid;
  station_sequence_value bigint := (input_item ->> 'stationSequence')::bigint;
  content_hash_value text := input_item ->> 'contentHash';
  operation_type_value text := input_item ->> 'operationType';
  aggregate_type_value text := input_item ->> 'aggregateType';
  aggregate_id_value uuid := (input_item ->> 'aggregateId')::uuid;
  actor_profile_id_value uuid := (authorization_data ->> 'actorProfileId')::uuid;
  authorization_state_value text := authorization_data ->> 'stateAtCapture';
  permission_version_value integer := (authorization_data ->> 'permissionVersion')::integer;
  correlation_id_value uuid := (input_item ->> 'correlationId')::uuid;
  receipt_id_value uuid := (input_item ->> 'receiptId')::uuid;
  audit_event_id_value uuid := (input_item ->> 'auditEventId')::uuid;
  processed_at_value timestamptz := (input_item ->> 'processedAtUtc')::timestamptz;
  result_code_value text := nullif(input_item ->> 'precheckCode', '');
  result_status_value text;
  actor_auth_user_id_value uuid;
  actor_display_name_value text;
  actor_role_code_value text;
  actor_found boolean := false;
  shipment_id_value uuid;
  feed_cycle_id_value uuid;
  line_id_value uuid;
  worker_id_value uuid;
  occurred_at_value timestamptz;
  event_type_value text;
begin
  select receipts.*
    into existing_receipt
  from app.sync_receipts as receipts
  where receipts.organization_id = organization_id_value
    and receipts.station_id = station_id_value
    and receipts.outbox_message_id = outbox_message_id_value;

  if found then
    if existing_receipt.content_hash <> content_hash_value then
      return jsonb_build_object(
        'outboxMessageId', outbox_message_id_value,
        'stationSequence', station_sequence_value,
        'status', 'FAILED_REVIEW',
        'receiptId', existing_receipt.id,
        'code', 'IDEMPOTENCY_CONTENT_MISMATCH',
        'processedAtUtc', processed_at_value
      );
    end if;

    return jsonb_build_object(
      'outboxMessageId', outbox_message_id_value,
      'stationSequence', station_sequence_value,
      'status', case
        when existing_receipt.terminal_status = 'APPLIED' then 'ALREADY_APPLIED'
        else 'FAILED_REVIEW'
      end,
      'receiptId', existing_receipt.id,
      'code', case
        when existing_receipt.terminal_status = 'APPLIED' then 'ALREADY_APPLIED'
        else existing_receipt.result_code
      end,
      'processedAtUtc', existing_receipt.processed_at_utc
    );
  end if;

  select profiles.auth_user_id, profiles.display_name, roles.code
    into actor_auth_user_id_value, actor_display_name_value, actor_role_code_value
  from app.user_profiles as profiles
  join app.roles as roles on roles.id = profiles.role_id
  where profiles.organization_id = organization_id_value
    and profiles.id = actor_profile_id_value;
  actor_found := found;

  if result_code_value is null and authorization_state_value = 'EXPIRED_CONTINGENCY' then
    result_code_value := 'AUTHORIZATION_EXPIRED_CONTINGENCY';
  elsif result_code_value is null and authorization_state_value = 'LEGACY_UNAVAILABLE' then
    result_code_value := 'LEGACY_AUTHORIZATION_UNAVAILABLE';
  elsif result_code_value is null and authorization_state_value <> 'VALID' then
    result_code_value := 'INVALID_EVENT';
  end if;

  if result_code_value is null and (
    not actor_found
    or not exists (
      select 1
      from app.station_user_authorizations as station_authorizations
      where station_authorizations.organization_id = organization_id_value
        and station_authorizations.plant_id = plant_id_value
        and station_authorizations.station_id = station_id_value
        and station_authorizations.user_profile_id = actor_profile_id_value
    )
  ) then
    result_code_value := 'SCOPE_MISMATCH';
  end if;

  if result_code_value is null and operation_type_value = 'OPERATION_STARTED' then
    shipment_id_value := (payload ->> 'shipmentId')::uuid;
    feed_cycle_id_value := (payload ->> 'feedCycleId')::uuid;
    line_id_value := (payload ->> 'lineId')::uuid;
    worker_id_value := (payload ->> 'responsibleWorkerId')::uuid;
    occurred_at_value := (payload ->> 'occurredAtUtc')::timestamptz;

    if exists (
      select 1 from app.shipments
      where organization_id = organization_id_value and id = shipment_id_value
    ) or not exists (
      select 1 from app.suppliers
      where organization_id = organization_id_value
        and id = (payload ->> 'supplierId')::uuid
    ) or not exists (
      select 1 from app.production_lines
      where organization_id = organization_id_value
        and plant_id = plant_id_value
        and id = line_id_value
    ) or not exists (
      select 1 from app.workers
      where organization_id = organization_id_value
        and plant_id = plant_id_value
        and id = worker_id_value
    ) or not exists (
      select 1 from app.station_line_scopes
      where organization_id = organization_id_value
        and plant_id = plant_id_value
        and station_id = station_id_value
        and production_line_id = line_id_value
    ) then
      result_code_value := 'DEPENDENCY_REJECTED';
    else
      insert into app.shipments (
        id, organization_id, plant_id, station_id, production_line_id,
        supplier_id, feed_cycle_id, started_by_profile_id, started_at_utc
      ) values (
        shipment_id_value, organization_id_value, plant_id_value, station_id_value,
        line_id_value, (payload ->> 'supplierId')::uuid, feed_cycle_id_value,
        actor_profile_id_value, occurred_at_value
      );

      insert into app.responsibility_assignments (
        id, organization_id, shipment_id, worker_id, assigned_by_profile_id,
        started_at_utc
      ) values (
        (payload ->> 'responsibilityAssignmentId')::uuid,
        organization_id_value, shipment_id_value, worker_id_value,
        actor_profile_id_value, occurred_at_value
      );
    end if;
  elsif result_code_value is null and operation_type_value = 'RESPONSIBLE_RELIEVED' then
    shipment_id_value := (payload ->> 'shipmentId')::uuid;
    worker_id_value := (payload ->> 'nextResponsibleWorkerId')::uuid;
    occurred_at_value := (payload ->> 'occurredAtUtc')::timestamptz;

    if not exists (
      select 1 from app.shipments
      where organization_id = organization_id_value
        and id = shipment_id_value
        and station_id = station_id_value
        and status = 'ACTIVE'
    ) or not exists (
      select 1 from app.workers
      where organization_id = organization_id_value
        and id = worker_id_value
    ) or not exists (
      select 1 from app.responsibility_assignments
      where organization_id = organization_id_value
        and shipment_id = shipment_id_value
        and worker_id = (payload ->> 'previousResponsibleWorkerId')::uuid
        and ended_at_utc is null
    ) then
      result_code_value := 'DEPENDENCY_REJECTED';
    else
      update app.responsibility_assignments
      set ended_at_utc = occurred_at_value
      where organization_id = organization_id_value
        and shipment_id = shipment_id_value
        and worker_id = (payload ->> 'previousResponsibleWorkerId')::uuid
        and ended_at_utc is null;

      insert into app.responsibility_assignments (
        id, organization_id, shipment_id, worker_id, assigned_by_profile_id,
        started_at_utc
      ) values (
        (payload ->> 'responsibilityAssignmentId')::uuid,
        organization_id_value, shipment_id_value, worker_id_value,
        actor_profile_id_value, occurred_at_value
      );
    end if;
  elsif result_code_value is null and operation_type_value = 'OPERATION_COMPLETED' then
    shipment_id_value := (payload ->> 'shipmentId')::uuid;
    worker_id_value := (payload ->> 'responsibleWorkerId')::uuid;
    occurred_at_value := (payload ->> 'occurredAtUtc')::timestamptz;

    if not exists (
      select 1 from app.shipments
      where organization_id = organization_id_value
        and id = shipment_id_value
        and station_id = station_id_value
        and status = 'ACTIVE'
    ) then
      result_code_value := 'DEPENDENCY_REJECTED';
    else
      update app.responsibility_assignments
      set ended_at_utc = occurred_at_value
      where organization_id = organization_id_value
        and shipment_id = shipment_id_value
        and worker_id = worker_id_value
        and ended_at_utc is null;

      update app.shipments
      set status = 'COMPLETED', completed_at_utc = occurred_at_value
      where organization_id = organization_id_value and id = shipment_id_value;
    end if;
  elsif result_code_value is null and operation_type_value = 'PRODUCTION_EVENT_CREATED' then
    shipment_id_value := (payload ->> 'shipmentId')::uuid;
    feed_cycle_id_value := (payload ->> 'feedCycleId')::uuid;
    line_id_value := (payload ->> 'lineId')::uuid;
    worker_id_value := (payload ->> 'responsibleWorkerId')::uuid;
    occurred_at_value := (payload ->> 'occurredAtUtc')::timestamptz;
    event_type_value := payload ->> 'eventType';

    if exists (
      select 1 from app.production_events
      where organization_id = organization_id_value
        and id = (payload ->> 'clientEventId')::uuid
    ) or not exists (
      select 1 from app.shipments
      where organization_id = organization_id_value
        and id = shipment_id_value
        and plant_id = plant_id_value
        and station_id = station_id_value
        and production_line_id = line_id_value
        and feed_cycle_id = feed_cycle_id_value
        and started_at_utc <= occurred_at_value
        and (completed_at_utc is null or completed_at_utc >= occurred_at_value)
    ) or not exists (
      select 1 from app.responsibility_assignments
      where organization_id = organization_id_value
        and shipment_id = shipment_id_value
        and worker_id = worker_id_value
        and started_at_utc <= occurred_at_value
        and (ended_at_utc is null or ended_at_utc >= occurred_at_value)
    ) then
      result_code_value := 'DEPENDENCY_REJECTED';
    elsif event_type_value = 'CAJUELA_REVERSED' and (
      not exists (
        select 1 from app.production_events
        where organization_id = organization_id_value
          and id = (payload ->> 'reversesClientEventId')::uuid
          and shipment_id = shipment_id_value
          and event_type = 'CAJUELA_ADDED'
      ) or exists (
        select 1 from app.production_events
        where organization_id = organization_id_value
          and reverses_client_event_id = (payload ->> 'reversesClientEventId')::uuid
      )
    ) then
      result_code_value := 'DEPENDENCY_REJECTED';
    else
      insert into app.production_events (
        id, organization_id, plant_id, station_id, production_line_id,
        feed_cycle_id, shipment_id, responsible_worker_id, event_type,
        work_period, occurred_at_utc, recorded_at_utc, client_sequence,
        quantity_delta, reverses_client_event_id, confirmation_id, reason_code,
        prepared_at_utc, input_source_kind, input_controller_id,
        input_signal_code, input_line_slot, input_was_repeat,
        authorization_profile_id, authorization_permission_version,
        authorization_state
      ) values (
        (payload ->> 'clientEventId')::uuid,
        organization_id_value,
        plant_id_value,
        station_id_value,
        line_id_value,
        feed_cycle_id_value,
        shipment_id_value,
        worker_id_value,
        event_type_value,
        payload ->> 'workPeriod',
        occurred_at_value,
        (payload ->> 'recordedAtUtc')::timestamptz,
        (payload ->> 'clientSequence')::bigint,
        (payload ->> 'quantityDelta')::integer,
        case when payload ? 'reversesClientEventId'
          then (payload ->> 'reversesClientEventId')::uuid else null end,
        case when payload ? 'confirmationId'
          then (payload ->> 'confirmationId')::uuid else null end,
        payload ->> 'reasonCode',
        case when payload ? 'preparedAtUtc'
          then (payload ->> 'preparedAtUtc')::timestamptz else null end,
        payload ->> 'inputSourceKind',
        payload ->> 'inputControllerId',
        payload ->> 'inputSignalCode',
        (payload ->> 'inputLineSlot')::integer,
        (payload ->> 'inputWasRepeat')::boolean,
        actor_profile_id_value,
        permission_version_value,
        authorization_state_value
      );
    end if;
  elsif result_code_value is null then
    result_code_value := 'INVALID_EVENT';
  end if;

  result_status_value := case
    when result_code_value is null then 'APPLIED'
    else 'FAILED_REVIEW'
  end;
  result_code_value := coalesce(result_code_value, 'APPLIED');

  insert into app.sync_receipts (
    id, organization_id, plant_id, station_id, outbox_message_id,
    station_sequence, content_hash, operation_type, aggregate_type,
    aggregate_id, terminal_status, result_code, processed_at_utc, correlation_id
  ) values (
    receipt_id_value, organization_id_value, plant_id_value, station_id_value,
    outbox_message_id_value, station_sequence_value, content_hash_value,
    operation_type_value, aggregate_type_value, aggregate_id_value,
    result_status_value, result_code_value, processed_at_value,
    correlation_id_value
  );

  insert into app.audit_events (
    id, organization_id, station_id, actor_kind, actor_profile_id,
    actor_auth_user_id, actor_display_name, actor_role_code, origin, action,
    entity_type, entity_id, occurred_at, correlation_id, result, reason_code,
    evidence_state, changed_fields, changes, request_method, request_path
  ) values (
    audit_event_id_value,
    organization_id_value,
    station_id_value,
    case when actor_found then 'AUTHENTICATED_USER'::app.audit_actor_kind
      else 'SYSTEM'::app.audit_actor_kind end,
    case when actor_found then actor_profile_id_value else null end,
    case when actor_found then actor_auth_user_id_value else null end,
    case when actor_found then actor_display_name_value else null end,
    case when actor_found then actor_role_code_value else null end,
    'SYNC',
    'sync.ingest',
    aggregate_type_value,
    aggregate_id_value,
    processed_at_value,
    correlation_id_value,
    case when result_status_value = 'APPLIED'
      then 'SUCCEEDED'::app.audit_result else 'REJECTED'::app.audit_result end,
    case when result_status_value = 'APPLIED' then null else result_code_value end,
    'NOT_APPLICABLE',
    '{}'::text[],
    '{}'::jsonb,
    'POST',
    '/api/v1/organizations/{organizationId}/stations/{stationId}/sync/push'
  );

  return jsonb_build_object(
    'outboxMessageId', outbox_message_id_value,
    'stationSequence', station_sequence_value,
    'status', result_status_value,
    'receiptId', receipt_id_value,
    'code', result_code_value,
    'processedAtUtc', processed_at_value
  );
end;
$$;

revoke all on function app.ingest_sync_item_v1(jsonb) from public;
revoke all on function app.ingest_sync_item_v1(jsonb) from anon;
revoke all on function app.ingest_sync_item_v1(jsonb) from authenticated;
grant execute on function app.ingest_sync_item_v1(jsonb) to service_role;

comment on table app.sync_receipts is
  'Recibos durables del push; el endurecimiento de concurrencia se completa en Sprint 3.3.';
comment on function app.ingest_sync_item_v1(jsonb) is
  'Aplica un elemento de sincronizacion en una transaccion PostgreSQL y devuelve un resultado estable.';
