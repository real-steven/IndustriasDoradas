-- Verifica que una ausencia de oro se revise sin convertirla en cero y que
-- la disposición vigente se resuelva sobre un historial append-only.

insert into app.shipment_gold_review_entries (
  id,
  organization_id,
  shipment_id,
  disposition,
  recorded_at_utc,
  recorded_by_profile_id,
  supersedes_entry_id,
  reason
) values (
  'e5270000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'e5200000-0000-4000-8000-000000000001',
  'OMITTED',
  '2026-10-05T10:00:00Z',
  'a1000000-0000-4000-8000-000000000001',
  null,
  'La gerencia no conservó la pesada'
);

do $$
declare
  current_disposition text;
begin
  select disposition
    into current_disposition
  from app.management_current_gold_review
  where organization_id = '30000000-0000-4000-8000-000000000001'
    and shipment_id = 'e5200000-0000-4000-8000-000000000001';

  if current_disposition <> 'OMITTED' then
    raise exception 'expected the shipment to be reviewed without data';
  end if;
end;
$$;

insert into app.shipment_gold_review_entries (
  id,
  organization_id,
  shipment_id,
  disposition,
  recorded_at_utc,
  recorded_by_profile_id,
  supersedes_entry_id,
  reason
) values (
  'e5270000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  'e5200000-0000-4000-8000-000000000001',
  'PENDING',
  '2026-10-05T10:05:00Z',
  'a1000000-0000-4000-8000-000000000001',
  'e5270000-0000-4000-8000-000000000001',
  null
);

do $$
declare
  current_disposition text;
begin
  select disposition
    into current_disposition
  from app.management_current_gold_review
  where organization_id = '30000000-0000-4000-8000-000000000001'
    and shipment_id = 'e5200000-0000-4000-8000-000000000001';

  if current_disposition <> 'PENDING' then
    raise exception 'expected the shipment to return to pending';
  end if;

  begin
    update app.shipment_gold_review_entries
    set reason = 'Mutación prohibida'
    where id = 'e5270000-0000-4000-8000-000000000001';
    raise exception 'gold review history must be append-only';
  exception
    when check_violation then
      null;
  end;
end;
$$;

insert into app.shipment_gold_review_entries (
  id,
  organization_id,
  shipment_id,
  disposition,
  recorded_at_utc,
  recorded_by_profile_id,
  supersedes_entry_id,
  reason
) values (
  'e5270000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000001',
  'e5200000-0000-4000-8000-000000000001',
  'ACKNOWLEDGED',
  '2026-10-05T10:10:00Z',
  'a1000000-0000-4000-8000-000000000001',
  'e5270000-0000-4000-8000-000000000002',
  null
);

do $$
declare
  current_disposition text;
begin
  select disposition
    into current_disposition
  from app.management_current_gold_review
  where organization_id = '30000000-0000-4000-8000-000000000001'
    and shipment_id = 'e5200000-0000-4000-8000-000000000001';

  if current_disposition <> 'ACKNOWLEDGED' then
    raise exception 'expected the shipment to remain read without gold data';
  end if;
end;
$$;
