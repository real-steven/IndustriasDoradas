-- Verifica barridas exactas, mercurio por rastra, oro solo web y permisos granulares.

begin;
insert into app.production_sweeps (
  id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
  shipment_id, client_sequence, cajuela_count, swept_at_utc, recorded_at_utc,
  recorded_by_profile_id, is_final
) values (
  'f4000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  1001,
  1,
  '2026-09-15T18:02:00Z',
  '2026-09-15T18:02:01Z',
  'a1000000-0000-4000-8000-000000000002',
  false
);

insert into app.sweep_production_events (
  organization_id, sweep_id, production_event_id, shipment_id,
  production_line_id, feed_cycle_id
) values (
  '30000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  'c5000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001'
);
commit;

insert into app.production_events (
  id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
  shipment_id, responsible_worker_id, event_type, work_period, occurred_at_utc,
  recorded_at_utc, client_sequence, quantity_delta, input_source_kind,
  input_controller_id, input_signal_code, input_line_slot, input_was_repeat,
  authorization_profile_id, authorization_permission_version, authorization_state
) values (
  'f4500000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000002',
  'd3000000-0000-4000-8000-000000000005',
  'd2000000-0000-4000-8000-000000000005',
  'b1000000-0000-4000-8000-000000000001',
  'CAJUELA_ADDED', 'DAY', '2026-09-20T18:01:00Z', '2026-09-20T18:01:01Z',
  9999, 1, 'CLICK', 'sprint-4-test', 'RegisterCajuela', 2, false,
  'a1000000-0000-4000-8000-000000000002', 1, 'VALID'
);

do $$
begin
  if (select count(*) from app.sweep_production_events
      where sweep_id = 'f4000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'sweep must preserve its exact production event';
  end if;

  begin
    insert into app.production_sweeps (
      id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
      shipment_id, client_sequence, cajuela_count, swept_at_utc, recorded_at_utc,
      recorded_by_profile_id
    ) values (
      'f4000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '34000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001',
      'c2000000-0000-4000-8000-000000000001',
      1002, 1, '2026-09-15T18:03:00Z', '2026-09-15T18:03:01Z',
      'a1000000-0000-4000-8000-000000000002'
    );
    insert into app.sweep_production_events (
      organization_id, sweep_id, production_event_id, shipment_id,
      production_line_id, feed_cycle_id
    ) values (
      '30000000-0000-4000-8000-000000000001',
      'f4000000-0000-4000-8000-000000000002',
      'c5000000-0000-4000-8000-000000000001',
      'c2000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001'
    );
    raise exception 'one production event must not belong to two sweeps';
  exception when unique_violation then null;
  end;

  begin
    insert into app.production_sweeps (
      id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
      shipment_id, client_sequence, cajuela_count, swept_at_utc, recorded_at_utc,
      recorded_by_profile_id
    ) values (
      'f4000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '34000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001',
      'c2000000-0000-4000-8000-000000000001',
      1003, 1, '2026-09-20T18:01:00Z', '2026-09-20T18:01:01Z',
      'a1000000-0000-4000-8000-000000000002'
    );
    insert into app.sweep_production_events (
      organization_id, sweep_id, production_event_id, shipment_id,
      production_line_id, feed_cycle_id
    ) values (
      '30000000-0000-4000-8000-000000000001',
      'f4000000-0000-4000-8000-000000000003',
      'f4500000-0000-4000-8000-000000000001',
      'c2000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001'
    );
    raise exception 'a sweep must not mix an event from another shipment';
  exception when foreign_key_violation then null;
  end;
end;
$$;

insert into app.mercury_movements (
  id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
  shipment_id, line_component_id, client_sequence, movement_kind, amount_grams,
  occurred_at_utc, recorded_at_utc, recorded_by_profile_id
) values (
  'f4100000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8001-000000000002',
  1101, 'INITIAL_LOAD', 400.70,
  '2026-09-15T18:00:00Z', '2026-09-15T18:00:01Z',
  'a1000000-0000-4000-8000-000000000002'
);

insert into app.mercury_movements (
  id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
  shipment_id, line_component_id, sweep_id, client_sequence, movement_kind,
  amount_grams, occurred_at_utc, recorded_at_utc, recorded_by_profile_id
) values (
  'f4100000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8001-000000000002',
  'f4000000-0000-4000-8000-000000000001',
  1102, 'RECOVERY', null,
  '2026-09-15T18:02:00Z', '2026-09-15T18:02:01Z',
  'a1000000-0000-4000-8000-000000000002'
);

do $$
begin
  if not exists (
    select 1 from app.mercury_movements
    where id = 'f4100000-0000-4000-8000-000000000002'
      and amount_grams is null
  ) then
    raise exception 'blank mercury must remain pending';
  end if;

  begin
    insert into app.mercury_movements (
      id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
      shipment_id, line_component_id, client_sequence, movement_kind, amount_grams,
      occurred_at_utc, recorded_at_utc, recorded_by_profile_id
    ) values (
      'f4100000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '34000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001',
      'c2000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8001-000000000002',
      1103, 'RELOAD', 1.234,
      '2026-09-15T18:03:00Z', '2026-09-15T18:03:01Z',
      'a1000000-0000-4000-8000-000000000002'
    );
    raise exception 'mercury must reject more than two decimal places';
  exception when check_violation then null;
  end;

  begin
    insert into app.mercury_movements (
      id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
      shipment_id, line_component_id, client_sequence, movement_kind, amount_grams,
      occurred_at_utc, recorded_at_utc, recorded_by_profile_id
    ) values (
      'f4100000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '34000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001',
      'c2000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8001-000000000001',
      1104, 'INITIAL_LOAD', 1,
      '2026-09-15T18:03:00Z', '2026-09-15T18:03:01Z',
      'a1000000-0000-4000-8000-000000000002'
    );
    raise exception 'mercury must reject a non-rastra component';
  exception when check_violation then null;
  end;
end;
$$;

insert into app.gold_result_entries (
  id, organization_id, sweep_id, amount_grams, recorded_at_utc, recorded_by_profile_id
) values (
  'f4200000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  null,
  '2026-09-15T19:00:00Z',
  'd1000000-0000-4000-8000-000000000001'
);

insert into app.gold_result_entries (
  id, organization_id, sweep_id, amount_grams, recorded_at_utc,
  recorded_by_profile_id, supersedes_result_id
) values (
  'f4200000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  0,
  '2026-09-15T19:05:00Z',
  'd1000000-0000-4000-8000-000000000001',
  'f4200000-0000-4000-8000-000000000001'
);

insert into app.user_permission_grants (
  id, organization_id, user_profile_id, permission_id, granted_by_profile_id, granted_at
)
select
  'f4300000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000002',
  permissions.id,
  'd1000000-0000-4000-8000-000000000001',
  '2026-10-02T00:00:00Z'
from app.permissions as permissions
where permissions.code = 'gold.read';

do $$
begin
  if not app.profile_has_permission(
    '30000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'gold.results.manage'
  ) then
    raise exception 'JEFE_EMPRESA must always manage gold';
  end if;

  if app.profile_has_permission(
    '30000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    'gold.read'
  ) then
    raise exception 'JEFE_PLANTA must never receive gold access';
  end if;

  if not app.profile_has_permission(
    '30000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'gold.read'
  ) or app.profile_has_permission(
    '30000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'gold.results.manage'
  ) then
    raise exception 'ADMINISTRADOR must receive only explicitly granted gold capabilities';
  end if;

  if has_table_privilege('authenticated', 'app.gold_result_entries', 'select')
     or has_table_privilege('anon', 'app.gold_result_entries', 'select') then
    raise exception 'gold tables must remain behind the API';
  end if;
end;
$$;
