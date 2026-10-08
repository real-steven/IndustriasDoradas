-- Verifica el modelo vigente: entrada y saldo final por rastra y barrida.

insert into app.mercury_movements (
  id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
  shipment_id, line_component_id, sweep_id, client_sequence, movement_kind,
  amount_grams, occurred_at_utc, recorded_at_utc, recorded_by_profile_id
) values
(
  'f4100000-0000-4000-8000-000000000011',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8001-000000000002',
  'f4000000-0000-4000-8000-000000000001',
  1111, 'SWEEP_INPUT', 400.70,
  '2026-09-15T18:02:00Z', '2026-09-15T18:02:01Z',
  'a1000000-0000-4000-8000-000000000002'
),
(
  'f4100000-0000-4000-8000-000000000012',
  '30000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8001-000000000002',
  'f4000000-0000-4000-8000-000000000001',
  1112, 'SWEEP_REMAINDER', 281.00,
  '2026-09-15T18:02:00Z', '2026-09-15T18:02:01Z',
  'a1000000-0000-4000-8000-000000000002'
);

do $$
begin
  if (select count(*) from app.mercury_movements
      where id in (
        'f4100000-0000-4000-8000-000000000011',
        'f4100000-0000-4000-8000-000000000012'
      )) <> 2 then
    raise exception 'sweep input and remainder must be persisted';
  end if;

  begin
    insert into app.mercury_movements (
      id, organization_id, plant_id, station_id, production_line_id, feed_cycle_id,
      shipment_id, line_component_id, client_sequence, movement_kind, amount_grams,
      occurred_at_utc, recorded_at_utc, recorded_by_profile_id
    ) values (
      'f4100000-0000-4000-8000-000000000013',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      '34000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001',
      'c2000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8001-000000000002',
      1113, 'SWEEP_INPUT', 1,
      '2026-09-15T18:02:00Z', '2026-09-15T18:02:01Z',
      'a1000000-0000-4000-8000-000000000002'
    );
    raise exception 'sweep measurements must require a sweep';
  exception when check_violation then null;
  end;
end;
$$;
