-- Sprint 7.5: operaciones atomicas requeridas por la API de inventario.

create function app.inventory_balance_v1(
  target_organization_id uuid,
  target_plant_id uuid,
  target_inventory_item_id uuid
)
returns numeric(18, 3)
language sql
stable
security invoker
set search_path = pg_catalog, app
as $$
  select coalesce(sum(movement.quantity_delta), 0)::numeric(18, 3)
  from app.inventory_movements as movement
  where movement.organization_id = target_organization_id
    and movement.plant_id = target_plant_id
    and movement.inventory_item_id = target_inventory_item_id;
$$;

revoke all on function app.inventory_balance_v1(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function app.inventory_balance_v1(uuid, uuid, uuid)
  to service_role;

create function app.record_inventory_review_v1(
  target_review_id uuid,
  target_organization_id uuid,
  target_plant_id uuid,
  reviewer_profile_id uuid,
  review_status text,
  reviewed_moment timestamptz,
  recorded_moment timestamptz,
  review_notes text,
  review_lines jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  line_count integer;
  has_differences boolean;
  stored_lines jsonb;
begin
  if pg_catalog.jsonb_typeof(review_lines) <> 'array'
     or pg_catalog.jsonb_array_length(review_lines) = 0 then
    raise exception using
      errcode = '23514',
      message = 'INVENTORY_REVIEW_LINES_REQUIRED';
  end if;

  insert into app.inventory_reviews (
    id, organization_id, plant_id, status, reviewed_by_profile_id,
    reviewed_at_utc, recorded_at_utc, notes
  ) values (
    target_review_id, target_organization_id, target_plant_id, review_status,
    reviewer_profile_id, reviewed_moment, recorded_moment, review_notes
  );

  insert into app.inventory_review_lines (
    organization_id, plant_id, review_id, inventory_item_id, unit_id,
    expected_quantity, counted_quantity, difference_quantity
  )
  select
    target_organization_id,
    target_plant_id,
    target_review_id,
    (line ->> 'inventoryItemId')::uuid,
    (line ->> 'unitId')::uuid,
    (line ->> 'expectedQuantity')::numeric(18, 3),
    (line ->> 'countedQuantity')::numeric(18, 3),
    (line ->> 'differenceQuantity')::numeric(18, 3)
  from pg_catalog.jsonb_array_elements(review_lines) as line;

  get diagnostics line_count = row_count;
  select exists (
    select 1
    from app.inventory_review_lines as review_line
    where review_line.organization_id = target_organization_id
      and review_line.review_id = target_review_id
      and review_line.difference_quantity <> 0
  ) into has_differences;

  if line_count <> pg_catalog.jsonb_array_length(review_lines)
     or (review_status = 'WITHOUT_DIFFERENCES' and has_differences)
     or (review_status = 'WITH_DIFFERENCES' and not has_differences) then
    raise exception using
      errcode = '23514',
      message = 'INVENTORY_REVIEW_STATUS_MISMATCH';
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'inventoryItemId', review_line.inventory_item_id,
      'unitId', review_line.unit_id,
      'expectedQuantity', review_line.expected_quantity,
      'countedQuantity', review_line.counted_quantity,
      'differenceQuantity', review_line.difference_quantity
    ) order by review_line.inventory_item_id
  ) into stored_lines
  from app.inventory_review_lines as review_line
  where review_line.organization_id = target_organization_id
    and review_line.review_id = target_review_id;

  return pg_catalog.jsonb_build_object(
    'id', target_review_id,
    'organizationId', target_organization_id,
    'plantId', target_plant_id,
    'status', review_status,
    'reviewedByProfileId', reviewer_profile_id,
    'reviewedAtUtc', reviewed_moment,
    'recordedAtUtc', recorded_moment,
    'notes', review_notes,
    'lines', stored_lines
  );
end;
$$;

revoke all on function app.record_inventory_review_v1(
  uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, text, jsonb
) from public, anon, authenticated;
grant execute on function app.record_inventory_review_v1(
  uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, text, jsonb
) to service_role;

comment on function app.inventory_balance_v1(uuid, uuid, uuid) is
  'Proyeccion exacta del saldo para la API; no almacena una existencia editable.';
comment on function app.record_inventory_review_v1(
  uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, text, jsonb
) is
  'Registra cabecera y lineas de una revision fisica en una sola transaccion.';
