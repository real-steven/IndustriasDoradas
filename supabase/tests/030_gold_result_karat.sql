-- Quilataje anotado junto con el oro: append-only, opcional y proyectado como
-- valor vigente. Usa el cargamento de la prueba 017 y deshace sus cambios.

do $$
declare
  current_result_id uuid;
  facts app.management_shipment_facts%rowtype;
begin
  select result_id into current_result_id
  from app.management_current_shipment_gold
  where organization_id = '30000000-0000-4000-8000-000000000001'
    and shipment_id = 'e5200000-0000-4000-8000-000000000001';

  select * into facts
  from app.management_shipment_facts
  where shipment_id = 'e5200000-0000-4000-8000-000000000001';
  if facts.gold_karat is not null then
    raise exception 'a gold result without karat must project null karat';
  end if;

  insert into app.shipment_gold_result_entries (
    id, organization_id, shipment_id, amount_grams, karat, recorded_at_utc,
    recorded_by_profile_id, supersedes_result_id, correction_reason
  ) values (
    '7f270000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'e5200000-0000-4000-8000-000000000001',
    0, 18.125, '2026-10-05T09:00:00Z',
    'd1000000-0000-4000-8000-000000000001', current_result_id,
    'Ensayo de laboratorio'
  );

  select * into facts
  from app.management_shipment_facts
  where shipment_id = 'e5200000-0000-4000-8000-000000000001';
  if facts.gold_karat <> 18.125 or facts.gold_amount_grams <> 0
     or facts.gold_result_id <> '7f270000-0000-4000-8000-000000000001' then
    raise exception 'karat correction must become the current result: %',
      row_to_json(facts);
  end if;

  begin
    insert into app.shipment_gold_result_entries (
      id, organization_id, shipment_id, amount_grams, karat, recorded_at_utc,
      recorded_by_profile_id, supersedes_result_id, correction_reason
    ) values (
      '7f270000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001',
      'e5200000-0000-4000-8000-000000000001',
      0, 24.5, '2026-10-06T09:00:00Z',
      'd1000000-0000-4000-8000-000000000001',
      '7f270000-0000-4000-8000-000000000001', 'Fuera de rango'
    );
    raise exception 'karat above 24 must be rejected';
  exception when check_violation then
    null;
  end;

  begin
    update app.shipment_gold_result_entries
    set karat = 20
    where id = '7f270000-0000-4000-8000-000000000001';
    raise exception 'karat history must stay append-only';
  exception when others then
    if sqlerrm = 'karat history must stay append-only' then
      raise;
    end if;
  end;

  -- Deshace los cambios de esta prueba sin afectar las siguientes.
  raise exception 'karat test rollback';
exception when raise_exception then
  if sqlerrm <> 'karat test rollback' then
    raise;
  end if;
end;
$$;
