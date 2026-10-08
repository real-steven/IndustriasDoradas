-- Verifica una fuente unica para cajuelas, barridas, mercurio y oro gerencial.

insert into app.shipments (
  id, organization_id, plant_id, station_id, production_line_id, supplier_id,
  feed_cycle_id, started_by_profile_id, started_at_utc, completed_at_utc, status
) values
  (
    'e5200000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '34000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000003',
    '35000000-0000-4000-8000-000000000001',
    'e5210000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    '2026-10-01T08:00:00Z', '2026-10-01T08:15:00Z', 'COMPLETED'
  ),
  (
    'e5200000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '34000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000004',
    '35000000-0000-4000-8000-000000000002',
    'e5210000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    '2026-10-02T12:00:00Z', '2026-10-02T12:10:00Z', 'COMPLETED'
  ),
  (
    'e5200000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '34000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000002',
    '35000000-0000-4000-8000-000000000001',
    'e5210000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000002',
    '2026-10-03T08:00:00Z', '2026-10-03T08:20:00Z', 'COMPLETED'
  ),
  (
    'e5200000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '34000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000001',
    '35000000-0000-4000-8000-000000000001',
    'e5210000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000002',
    '2026-10-04T08:00:00Z', null, 'ACTIVE'
  );

insert into app.responsibility_assignments (
  id, organization_id, shipment_id, worker_id, assigned_by_profile_id,
  started_at_utc, ended_at_utc
) values
  (
    'e5220000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'e5200000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    '2026-10-01T08:00:00Z', '2026-10-01T08:15:00Z'
  ),
  (
    'e5220000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    'e5200000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    '2026-10-02T12:00:00Z', '2026-10-02T12:10:00Z'
  ),
  (
    'e5220000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    'e5200000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    '2026-10-03T08:00:00Z', '2026-10-03T08:20:00Z'
  ),
  (
    'e5220000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000001',
    'e5200000-0000-4000-8000-000000000004',
    'b1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    '2026-10-04T08:00:00Z', null
  );

-- 261 altas y un reverso producen 260 cajuelas en la primera barrida.
begin;
insert into app.production_events (
  id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
  shipment_id, responsible_worker_id, event_type, work_period, occurred_at_utc,
  recorded_at_utc, client_sequence, quantity_delta, input_source_kind,
  input_controller_id, input_signal_code, input_line_slot, input_was_repeat,
  authorization_profile_id, authorization_permission_version, authorization_state
)
select
  md5('sprint-5-2-add-' || series.value::text)::uuid,
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000004',
  'e5210000-0000-4000-8000-000000000002',
  'e5200000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000001',
  'CAJUELA_ADDED', 'DAY',
  '2026-10-02T12:00:00Z'::timestamptz + series.value * interval '1 second',
  '2026-10-02T12:00:01Z'::timestamptz + series.value * interval '1 second',
  820000 + series.value, 1, 'CLICK', 'sprint-5-2', 'RegisterCajuela', 4, false,
  'a1000000-0000-4000-8000-000000000002', 1, 'VALID'
from generate_series(1, 261) as series(value);

insert into app.production_events (
  id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
  shipment_id, responsible_worker_id, event_type, work_period, occurred_at_utc,
  recorded_at_utc, client_sequence, quantity_delta, reverses_client_event_id,
  confirmation_id, reason_code, prepared_at_utc, input_source_kind,
  input_controller_id, input_signal_code, input_line_slot, input_was_repeat,
  authorization_profile_id, authorization_permission_version, authorization_state
) values (
  'e5230000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000004',
  'e5210000-0000-4000-8000-000000000002',
  'e5200000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000001',
  'CAJUELA_REVERSED', 'DAY', '2026-10-02T12:04:22Z', '2026-10-02T12:04:23Z',
  820262, -1, md5('sprint-5-2-add-261')::uuid,
  'e5240000-0000-4000-8000-000000000001', 'IMMEDIATE_INPUT_ERROR',
  '2026-10-02T12:04:21Z', 'CLICK', 'sprint-5-2', 'ReverseCajuela', 4, false,
  'a1000000-0000-4000-8000-000000000002', 1, 'VALID'
);

insert into app.production_sweeps (
  id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
  shipment_id, client_sequence, cajuela_count, swept_at_utc, recorded_at_utc,
  recorded_by_profile_id, is_final
) values (
  'e5250000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000004',
  'e5210000-0000-4000-8000-000000000002',
  'e5200000-0000-4000-8000-000000000002',
  820263, 260, '2026-10-02T12:06:00Z', '2026-10-02T12:06:01Z',
  'a1000000-0000-4000-8000-000000000002', false
);

insert into app.sweep_production_events (
  organization_id, sweep_id, production_event_id, shipment_id,
  production_line_id, feed_cycle_id
)
select
  '30000000-0000-4000-8000-000000000001',
  'e5250000-0000-4000-8000-000000000001',
  events.id,
  'e5200000-0000-4000-8000-000000000002',
  '32000000-0000-4000-8000-000000000004',
  'e5210000-0000-4000-8000-000000000002'
from app.production_events as events
where events.organization_id = '30000000-0000-4000-8000-000000000001'
  and events.shipment_id = 'e5200000-0000-4000-8000-000000000002';
commit;

-- Dato ocurrido antes del cierre pero confirmado tarde: debe sumarse una sola vez.
insert into app.production_events (
  id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
  shipment_id, responsible_worker_id, event_type, work_period, occurred_at_utc,
  recorded_at_utc, client_sequence, quantity_delta, input_source_kind,
  input_controller_id, input_signal_code, input_line_slot, input_was_repeat,
  authorization_profile_id, authorization_permission_version, authorization_state
) values (
  'e5230000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000004',
  'e5210000-0000-4000-8000-000000000002',
  'e5200000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-000000000001',
  'CAJUELA_ADDED', 'DAY', '2026-10-02T12:09:00Z', '2026-10-02T12:20:00Z',
  820264, 1, 'CLICK', 'sprint-5-2', 'RegisterCajuela', 4, false,
  'a1000000-0000-4000-8000-000000000002', 1, 'VALID'
);

insert into app.mercury_movements (
  id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
  shipment_id, line_component_id, sweep_id, client_sequence, movement_kind,
  amount_grams, occurred_at_utc, recorded_at_utc, recorded_by_profile_id,
  supersedes_movement_id, notes
) values
  (
    'e5260000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '34000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000004',
    'e5210000-0000-4000-8000-000000000002',
    'e5200000-0000-4000-8000-000000000002',
    '33000000-0000-4000-8004-000000000002',
    'e5250000-0000-4000-8000-000000000001',
    830001, 'SWEEP_INPUT', 400,
    '2026-10-02T12:06:00Z', '2026-10-02T12:06:02Z',
    'a1000000-0000-4000-8000-000000000002', null, null
  ),
  (
    'e5260000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '34000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000004',
    'e5210000-0000-4000-8000-000000000002',
    'e5200000-0000-4000-8000-000000000002',
    '33000000-0000-4000-8004-000000000002',
    'e5250000-0000-4000-8000-000000000001',
    830002, 'SWEEP_INPUT', 401,
    '2026-10-02T12:06:00Z', '2026-10-02T12:25:00Z',
    'a1000000-0000-4000-8000-000000000002',
    'e5260000-0000-4000-8000-000000000001', 'Correccion de lectura'
  ),
  (
    'e5260000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '34000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000004',
    'e5210000-0000-4000-8000-000000000002',
    'e5200000-0000-4000-8000-000000000002',
    '33000000-0000-4000-8004-000000000002',
    'e5250000-0000-4000-8000-000000000001',
    830003, 'SWEEP_REMAINDER', 300,
    '2026-10-02T12:06:00Z', '2026-10-02T12:26:00Z',
    'a1000000-0000-4000-8000-000000000002', null, null
  );

insert into app.shipment_gold_result_entries (
  id, organization_id, shipment_id, amount_grams, recorded_at_utc,
  recorded_by_profile_id, supersedes_result_id, correction_reason
) values
  (
    'e5270000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'e5200000-0000-4000-8000-000000000001',
    0, '2026-10-01T09:00:00Z',
    'd1000000-0000-4000-8000-000000000001', null, null
  ),
  (
    'e5270000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    'e5200000-0000-4000-8000-000000000002',
    10, '2026-10-02T12:30:00Z',
    'd1000000-0000-4000-8000-000000000001', null, null
  ),
  (
    'e5270000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    'e5200000-0000-4000-8000-000000000002',
    12.50, '2026-10-02T12:35:00Z',
    'd1000000-0000-4000-8000-000000000001',
    'e5270000-0000-4000-8000-000000000002', 'Lectura final confirmada'
  );

do $$
declare
  facts app.management_shipment_facts%rowtype;
  mercury app.management_sweep_mercury%rowtype;
begin
  select * into facts
  from app.management_shipment_facts
  where shipment_id = 'e5200000-0000-4000-8000-000000000002';

  if facts.cajuela_total <> 261
     or facts.sweep_count <> 1
     or facts.swept_cajuelas <> 260
     or facts.cajuelas_since_last_sweep <> 1
     or facts.next_sweep_at <> 510
     or facts.sweep_pending
     or facts.gold_amount_grams <> 12.50
     or facts.gold_revision_count <> 2 then
    raise exception 'late sweep shipment facts are incorrect: %', row_to_json(facts);
  end if;

  select * into facts
  from app.management_shipment_facts
  where shipment_id = 'e5200000-0000-4000-8000-000000000001';
  if not facts.has_gold_result or facts.gold_amount_grams <> 0 then
    raise exception 'explicit zero gold must differ from missing gold';
  end if;

  select * into facts
  from app.management_shipment_facts
  where shipment_id = 'e5200000-0000-4000-8000-000000000003';
  if facts.has_gold_result or facts.gold_amount_grams is not null then
    raise exception 'missing gold must remain absent, not zero';
  end if;

  if not exists (
    select 1 from app.management_operation_lines
    where shipment_id = 'e5200000-0000-4000-8000-000000000004'
      and cajuela_total = 0
  ) then
    raise exception 'active shipment must be exposed by operation read model';
  end if;

  select * into mercury
  from app.management_sweep_mercury
  where sweep_id = 'e5250000-0000-4000-8000-000000000001'
    and line_component_id = '33000000-0000-4000-8004-000000000002';
  if mercury.input_grams <> 401
     or mercury.remainder_grams <> 300
     or not mercury.has_input_record
     or not mercury.has_remainder_record then
    raise exception 'mercury view must select current corrected measurements';
  end if;

  if (select count(*) from app.management_current_shipment_gold
      where shipment_id = 'e5200000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'gold correction chain must expose exactly one current value';
  end if;

  if has_table_privilege('authenticated', 'app.management_shipment_facts', 'SELECT')
     or has_table_privilege('anon', 'app.management_shipment_facts', 'SELECT') then
    raise exception 'management read models must remain private to the API';
  end if;

  begin
    insert into app.shipment_gold_result_entries (
      id, organization_id, shipment_id, amount_grams, recorded_at_utc,
      recorded_by_profile_id
    ) values (
      'e5270000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000001',
      'e5200000-0000-4000-8000-000000000004',
      1, '2026-10-04T09:00:00Z',
      'd1000000-0000-4000-8000-000000000001'
    );
    raise exception 'gold must be rejected while shipment is active';
  exception when check_violation then
    if sqlerrm <> 'GOLD_REQUIRES_COMPLETED_SHIPMENT' then
      raise;
    end if;
  end;

  begin
    update app.shipment_gold_result_entries
    set amount_grams = 99
    where id = 'e5270000-0000-4000-8000-000000000001';
    raise exception 'gold history must be append-only';
  exception when check_violation then
    if sqlerrm <> 'SPRINT_4_HISTORY_IS_APPEND_ONLY' then
      raise;
    end if;
  end;
end;
$$;
