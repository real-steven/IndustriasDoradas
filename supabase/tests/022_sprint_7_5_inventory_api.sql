-- Sprint 7.5: funciones privadas y atomicas consumidas por NestJS.

do $$
declare
  result jsonb;
begin
  if app.inventory_balance_v1(
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    '77200000-0000-4000-8000-000000000001'
  ) <> 8 then
    raise exception 'API balance must reconstruct eight units';
  end if;

  result := app.record_inventory_review_v1(
    '78000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    'WITH_DIFFERENCES',
    '2026-10-22T18:00:00Z',
    '2026-10-22T18:00:01Z',
    'Conteo API',
    jsonb_build_array(jsonb_build_object(
      'inventoryItemId', '77200000-0000-4000-8000-000000000001',
      'unitId', '77100000-0000-4000-8000-000000000001',
      'expectedQuantity', 8,
      'countedQuantity', 7,
      'differenceQuantity', -1
    ))
  );

  if result ->> 'status' <> 'WITH_DIFFERENCES'
     or jsonb_array_length(result -> 'lines') <> 1 then
    raise exception 'atomic review response is invalid: %', result;
  end if;

  begin
    perform app.record_inventory_review_v1(
      '78000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      'WITH_DIFFERENCES',
      '2026-10-22T18:10:00Z',
      '2026-10-22T18:10:01Z',
      null,
      jsonb_build_array(jsonb_build_object(
        'inventoryItemId', '77200000-0000-4000-8000-000000000001',
        'unitId', '77100000-0000-4000-8000-000000000001',
        'expectedQuantity', 8,
        'countedQuantity', 8,
        'differenceQuantity', 0
      ))
    );
    raise exception 'WITH_DIFFERENCES without a difference must fail';
  exception when check_violation then
    if sqlerrm <> 'INVENTORY_REVIEW_STATUS_MISMATCH' then raise; end if;
  end;

  if exists (
    select 1 from app.inventory_reviews
    where id = '78000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'failed review must roll back its header and lines';
  end if;

  if has_function_privilege(
    'anon',
    'app.inventory_balance_v1(uuid,uuid,uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'app.record_inventory_review_v1(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,jsonb)',
    'execute'
  ) then
    raise exception 'browser roles must not execute inventory API functions';
  end if;
  if not has_function_privilege(
    'service_role',
    'app.record_inventory_review_v1(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,jsonb)',
    'execute'
  ) then
    raise exception 'backend service must execute atomic inventory reviews';
  end if;
end;
$$;
