-- Liquidaciones financieras editables para reportes gerenciales.
-- Las tablas permanecen en el esquema privado app y solo el API usa service_role.

create table app.report_settlements (
  id uuid primary key,
  organization_id uuid not null,
  supplier_id uuid not null,
  week_start date not null,
  buyer_name text not null,
  destination text,
  currency_code text not null default 'CRC',
  participation_percentage numeric(7, 4) not null default 50,
  received_amount_crc numeric(16, 2),
  notes text,
  status text not null default 'DRAFT',
  revision integer not null default 1,
  supersedes_settlement_id uuid,
  row_version integer not null default 1,
  created_by_profile_id uuid not null,
  updated_by_profile_id uuid not null,
  approved_by_profile_id uuid,
  approved_at_utc timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_settlements_organization_id_id_unique
    unique (organization_id, id),
  constraint report_settlements_supplier_fk
    foreign key (organization_id, supplier_id)
    references app.suppliers (organization_id, id) on delete restrict,
  constraint report_settlements_created_by_fk
    foreign key (organization_id, created_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint report_settlements_updated_by_fk
    foreign key (organization_id, updated_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint report_settlements_approved_by_fk
    foreign key (organization_id, approved_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint report_settlements_supersedes_fk
    foreign key (organization_id, supersedes_settlement_id)
    references app.report_settlements (organization_id, id) on delete restrict,
  constraint report_settlements_buyer_check check (btrim(buyer_name) <> ''),
  constraint report_settlements_destination_check
    check (destination is null or btrim(destination) <> ''),
  constraint report_settlements_currency_check check (currency_code = 'CRC'),
  constraint report_settlements_participation_check
    check (participation_percentage >= 0 and participation_percentage <= 100),
  constraint report_settlements_received_check
    check (received_amount_crc is null or received_amount_crc >= 0),
  constraint report_settlements_notes_check
    check (notes is null or btrim(notes) <> ''),
  constraint report_settlements_status_check
    check (status in ('DRAFT', 'REVIEWED', 'APPROVED', 'CLOSED')),
  constraint report_settlements_revision_check check (revision > 0),
  constraint report_settlements_row_version_check check (row_version > 0),
  constraint report_settlements_supersedes_check
    check (supersedes_settlement_id is null or supersedes_settlement_id <> id),
  constraint report_settlements_approval_check check (
    (status in ('DRAFT', 'REVIEWED') and approved_by_profile_id is null and approved_at_utc is null)
    or (status in ('APPROVED', 'CLOSED') and approved_by_profile_id is not null and approved_at_utc is not null)
  ),
  constraint report_settlements_updated_check check (updated_at >= created_at)
);

create index ix_report_settlements_period
  on app.report_settlements (organization_id, week_start desc, status, id);
create index ix_report_settlements_supplier
  on app.report_settlements (organization_id, supplier_id, week_start desc);
create unique index ux_report_settlements_superseded_once
  on app.report_settlements (organization_id, supersedes_settlement_id)
  where supersedes_settlement_id is not null;

create table app.report_settlement_lines (
  id uuid primary key,
  organization_id uuid not null,
  settlement_id uuid not null,
  shipment_id uuid not null,
  assay_label text,
  karat numeric(6, 3) not null,
  grams_liquidated numeric(14, 3) not null,
  price_per_karat_crc numeric(16, 2),
  price_per_gram_crc numeric(16, 2) not null,
  gross_amount_crc numeric(16, 2)
    generated always as (round(grams_liquidated * price_per_gram_crc, 2)) stored,
  display_order integer not null,
  created_at timestamptz not null default now(),
  constraint report_settlement_lines_organization_id_id_unique
    unique (organization_id, id),
  constraint report_settlement_lines_settlement_fk
    foreign key (organization_id, settlement_id)
    references app.report_settlements (organization_id, id) on delete cascade,
  constraint report_settlement_lines_shipment_fk
    foreign key (organization_id, shipment_id)
    references app.shipments (organization_id, id) on delete restrict,
  constraint report_settlement_lines_order_unique
    unique (organization_id, settlement_id, display_order),
  constraint report_settlement_lines_label_check
    check (assay_label is null or btrim(assay_label) <> ''),
  constraint report_settlement_lines_karat_check check (karat >= 0 and karat <= 24),
  constraint report_settlement_lines_grams_check check (grams_liquidated > 0),
  constraint report_settlement_lines_price_karat_check
    check (price_per_karat_crc is null or price_per_karat_crc >= 0),
  constraint report_settlement_lines_price_gram_check check (price_per_gram_crc >= 0),
  constraint report_settlement_lines_order_check check (display_order > 0)
);

create index ix_report_settlement_lines_settlement
  on app.report_settlement_lines (organization_id, settlement_id, display_order);
create index ix_report_settlement_lines_shipment
  on app.report_settlement_lines (organization_id, shipment_id);

create table app.report_settlement_expenses (
  id uuid primary key,
  organization_id uuid not null,
  settlement_id uuid not null,
  category text not null,
  concept text not null,
  amount_crc numeric(16, 2) not null,
  occurred_on date not null,
  responsible_name text,
  display_order integer not null,
  created_at timestamptz not null default now(),
  constraint report_settlement_expenses_organization_id_id_unique
    unique (organization_id, id),
  constraint report_settlement_expenses_settlement_fk
    foreign key (organization_id, settlement_id)
    references app.report_settlements (organization_id, id) on delete cascade,
  constraint report_settlement_expenses_order_unique
    unique (organization_id, settlement_id, display_order),
  constraint report_settlement_expenses_category_check check (
    category in ('TRANSPORT', 'BAGS', 'PLANT', 'SALARY', 'FINCA', 'OTHER')
  ),
  constraint report_settlement_expenses_concept_check check (btrim(concept) <> ''),
  constraint report_settlement_expenses_amount_check check (amount_crc >= 0),
  constraint report_settlement_expenses_responsible_check
    check (responsible_name is null or btrim(responsible_name) <> ''),
  constraint report_settlement_expenses_order_check check (display_order > 0)
);

create index ix_report_settlement_expenses_settlement
  on app.report_settlement_expenses (organization_id, settlement_id, display_order);
create index ix_report_settlement_expenses_period
  on app.report_settlement_expenses (organization_id, occurred_on, category);

create function app.validate_report_settlement_line_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  settlement_supplier_id uuid;
  settlement_status text;
  shipment_supplier_id uuid;
  shipment_status text;
begin
  select settlement.supplier_id, settlement.status
    into settlement_supplier_id, settlement_status
  from app.report_settlements as settlement
  where settlement.organization_id = new.organization_id
    and settlement.id = new.settlement_id;

  select shipment.supplier_id, shipment.status
    into shipment_supplier_id, shipment_status
  from app.shipments as shipment
  where shipment.organization_id = new.organization_id
    and shipment.id = new.shipment_id;

  if settlement_status <> 'DRAFT' then
    raise exception using errcode = '23514', message = 'REPORT_SETTLEMENT_NOT_EDITABLE';
  end if;
  if shipment_status <> 'COMPLETED' then
    raise exception using errcode = '23514', message = 'REPORT_SHIPMENT_NOT_COMPLETED';
  end if;
  if shipment_supplier_id is distinct from settlement_supplier_id then
    raise exception using errcode = '23514', message = 'REPORT_SUPPLIER_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger trg_validate_report_settlement_line
before insert or update on app.report_settlement_lines
for each row execute function app.validate_report_settlement_line_v1();

create function app.validate_report_settlement_expense_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
begin
  if not exists (
    select 1
    from app.report_settlements as settlement
    where settlement.organization_id = new.organization_id
      and settlement.id = new.settlement_id
      and settlement.status = 'DRAFT'
  ) then
    raise exception using errcode = '23514', message = 'REPORT_SETTLEMENT_NOT_EDITABLE';
  end if;
  return new;
end;
$$;

create trigger trg_validate_report_settlement_expense
before insert or update on app.report_settlement_expenses
for each row execute function app.validate_report_settlement_expense_v1();

create function app.protect_report_settlement_child_delete_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
begin
  if not exists (
    select 1
    from app.report_settlements as settlement
    where settlement.organization_id = old.organization_id
      and settlement.id = old.settlement_id
      and settlement.status = 'DRAFT'
  ) then
    raise exception using errcode = '23514', message = 'REPORT_SETTLEMENT_NOT_EDITABLE';
  end if;
  return old;
end;
$$;

create trigger trg_protect_report_settlement_line_delete
before delete on app.report_settlement_lines
for each row execute function app.protect_report_settlement_child_delete_v1();

create trigger trg_protect_report_settlement_expense_delete
before delete on app.report_settlement_expenses
for each row execute function app.protect_report_settlement_child_delete_v1();

create function app.save_report_settlement_v1(
  target_settlement jsonb,
  target_lines jsonb,
  target_expenses jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  target_id uuid := (target_settlement ->> 'id')::uuid;
  target_organization_id uuid := (target_settlement ->> 'organizationId')::uuid;
  expected_version integer := coalesce((target_settlement ->> 'rowVersion')::integer, 0);
  stored_count integer;
begin
  if jsonb_typeof(target_lines) <> 'array' or jsonb_array_length(target_lines) = 0 then
    raise exception using errcode = '23514', message = 'REPORT_SETTLEMENT_LINES_REQUIRED';
  end if;
  if jsonb_typeof(target_expenses) <> 'array' then
    raise exception using errcode = '23514', message = 'REPORT_SETTLEMENT_EXPENSES_INVALID';
  end if;

  if expected_version = 0 then
    insert into app.report_settlements (
      id, organization_id, supplier_id, week_start, buyer_name, destination,
      participation_percentage, received_amount_crc, notes,
      created_by_profile_id, updated_by_profile_id
    ) values (
      target_id,
      target_organization_id,
      (target_settlement ->> 'supplierId')::uuid,
      (target_settlement ->> 'weekStart')::date,
      target_settlement ->> 'buyerName',
      nullif(btrim(target_settlement ->> 'destination'), ''),
      (target_settlement ->> 'participationPercentage')::numeric,
      nullif(target_settlement ->> 'receivedAmountCrc', '')::numeric,
      nullif(btrim(target_settlement ->> 'notes'), ''),
      (target_settlement ->> 'actorProfileId')::uuid,
      (target_settlement ->> 'actorProfileId')::uuid
    );
  else
    update app.report_settlements
    set
      supplier_id = (target_settlement ->> 'supplierId')::uuid,
      week_start = (target_settlement ->> 'weekStart')::date,
      buyer_name = target_settlement ->> 'buyerName',
      destination = nullif(btrim(target_settlement ->> 'destination'), ''),
      participation_percentage = (target_settlement ->> 'participationPercentage')::numeric,
      received_amount_crc = nullif(target_settlement ->> 'receivedAmountCrc', '')::numeric,
      notes = nullif(btrim(target_settlement ->> 'notes'), ''),
      updated_by_profile_id = (target_settlement ->> 'actorProfileId')::uuid,
      updated_at = now(),
      row_version = row_version + 1
    where organization_id = target_organization_id
      and id = target_id
      and status = 'DRAFT'
      and row_version = expected_version;
    get diagnostics stored_count = row_count;
    if stored_count <> 1 then
      raise exception using errcode = '40001', message = 'REPORT_SETTLEMENT_CONFLICT';
    end if;
    delete from app.report_settlement_expenses
    where organization_id = target_organization_id and settlement_id = target_id;
    delete from app.report_settlement_lines
    where organization_id = target_organization_id and settlement_id = target_id;
  end if;

  insert into app.report_settlement_lines (
    id, organization_id, settlement_id, shipment_id, assay_label, karat,
    grams_liquidated, price_per_karat_crc, price_per_gram_crc, display_order
  )
  select
    (line ->> 'id')::uuid,
    target_organization_id,
    target_id,
    (line ->> 'shipmentId')::uuid,
    nullif(btrim(line ->> 'assayLabel'), ''),
    (line ->> 'karat')::numeric,
    (line ->> 'gramsLiquidated')::numeric,
    nullif(line ->> 'pricePerKaratCrc', '')::numeric,
    (line ->> 'pricePerGramCrc')::numeric,
    ordinality::integer
  from jsonb_array_elements(target_lines) with ordinality as source(line, ordinality);

  insert into app.report_settlement_expenses (
    id, organization_id, settlement_id, category, concept, amount_crc,
    occurred_on, responsible_name, display_order
  )
  select
    (expense ->> 'id')::uuid,
    target_organization_id,
    target_id,
    expense ->> 'category',
    expense ->> 'concept',
    (expense ->> 'amountCrc')::numeric,
    (expense ->> 'occurredOn')::date,
    nullif(btrim(expense ->> 'responsibleName'), ''),
    ordinality::integer
  from jsonb_array_elements(target_expenses) with ordinality as source(expense, ordinality);

  return target_id;
end;
$$;

create function app.transition_report_settlement_v1(
  target_organization_id uuid,
  target_settlement_id uuid,
  expected_version integer,
  target_status text,
  actor_profile_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  current_status text;
  stored_count integer;
begin
  select status into current_status
  from app.report_settlements
  where organization_id = target_organization_id and id = target_settlement_id
  for update;

  if current_status is null then
    raise exception using errcode = 'P0002', message = 'REPORT_SETTLEMENT_NOT_FOUND';
  end if;
  if not (
    (current_status = 'DRAFT' and target_status = 'REVIEWED')
    or (current_status = 'REVIEWED' and target_status in ('DRAFT', 'APPROVED'))
    or (current_status = 'APPROVED' and target_status = 'CLOSED')
  ) then
    raise exception using errcode = '23514', message = 'REPORT_STATUS_TRANSITION_INVALID';
  end if;
  if target_status in ('REVIEWED', 'APPROVED') and not exists (
    select 1 from app.report_settlement_lines
    where organization_id = target_organization_id and settlement_id = target_settlement_id
  ) then
    raise exception using errcode = '23514', message = 'REPORT_SETTLEMENT_LINES_REQUIRED';
  end if;
  if target_status in ('REVIEWED', 'APPROVED') and (
    select coalesce(sum(expense.amount_crc), 0)
    from app.report_settlement_expenses as expense
    where expense.organization_id = target_organization_id
      and expense.settlement_id = target_settlement_id
  ) > (
    select coalesce(sum(line.gross_amount_crc), 0)
    from app.report_settlement_lines as line
    where line.organization_id = target_organization_id
      and line.settlement_id = target_settlement_id
  ) then
    raise exception using errcode = '23514', message = 'REPORT_EXPENSES_EXCEED_GROSS';
  end if;

  update app.report_settlements
  set
    status = target_status,
    updated_by_profile_id = actor_profile_id,
    updated_at = now(),
    row_version = row_version + 1,
    approved_by_profile_id = case
      when target_status = 'APPROVED' then actor_profile_id
      else approved_by_profile_id
    end,
    approved_at_utc = case
      when target_status = 'APPROVED' then now()
      else approved_at_utc
    end
  where organization_id = target_organization_id
    and id = target_settlement_id
    and row_version = expected_version;
  get diagnostics stored_count = row_count;
  if stored_count <> 1 then
    raise exception using errcode = '40001', message = 'REPORT_SETTLEMENT_CONFLICT';
  end if;
  return target_settlement_id;
end;
$$;

create function app.create_report_settlement_correction_v1(
  target_organization_id uuid,
  source_settlement_id uuid,
  correction_settlement_id uuid,
  actor_profile_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  stored_count integer;
begin
  insert into app.report_settlements (
    id, organization_id, supplier_id, week_start, buyer_name, destination,
    currency_code, participation_percentage, received_amount_crc, notes,
    status, revision, supersedes_settlement_id, row_version,
    created_by_profile_id, updated_by_profile_id
  )
  select
    correction_settlement_id,
    source.organization_id,
    source.supplier_id,
    source.week_start,
    source.buyer_name,
    source.destination,
    source.currency_code,
    source.participation_percentage,
    source.received_amount_crc,
    source.notes,
    'DRAFT',
    source.revision + 1,
    source.id,
    1,
    actor_profile_id,
    actor_profile_id
  from app.report_settlements as source
  where source.organization_id = target_organization_id
    and source.id = source_settlement_id
    and source.status in ('APPROVED', 'CLOSED');
  get diagnostics stored_count = row_count;
  if stored_count <> 1 then
    raise exception using errcode = '23514', message = 'REPORT_CORRECTION_SOURCE_INVALID';
  end if;

  insert into app.report_settlement_lines (
    id, organization_id, settlement_id, shipment_id, assay_label, karat,
    grams_liquidated, price_per_karat_crc, price_per_gram_crc, display_order
  )
  select
    gen_random_uuid(),
    source.organization_id,
    correction_settlement_id,
    source.shipment_id,
    source.assay_label,
    source.karat,
    source.grams_liquidated,
    source.price_per_karat_crc,
    source.price_per_gram_crc,
    source.display_order
  from app.report_settlement_lines as source
  where source.organization_id = target_organization_id
    and source.settlement_id = source_settlement_id;

  insert into app.report_settlement_expenses (
    id, organization_id, settlement_id, category, concept, amount_crc,
    occurred_on, responsible_name, display_order
  )
  select
    gen_random_uuid(),
    source.organization_id,
    correction_settlement_id,
    source.category,
    source.concept,
    source.amount_crc,
    source.occurred_on,
    source.responsible_name,
    source.display_order
  from app.report_settlement_expenses as source
  where source.organization_id = target_organization_id
    and source.settlement_id = source_settlement_id;

  return correction_settlement_id;
end;
$$;

create view app.management_report_settlements
with (security_invoker = true)
as
select
  settlement.id,
  settlement.organization_id,
  settlement.supplier_id,
  supplier.name as supplier_name,
  settlement.week_start,
  settlement.buyer_name,
  settlement.destination,
  settlement.currency_code,
  settlement.participation_percentage,
  settlement.received_amount_crc,
  settlement.notes,
  settlement.status,
  settlement.revision,
  settlement.supersedes_settlement_id,
  settlement.row_version,
  settlement.created_by_profile_id,
  settlement.updated_by_profile_id,
  settlement.approved_by_profile_id,
  settlement.approved_at_utc,
  settlement.created_at,
  settlement.updated_at,
  coalesce(line_totals.total_grams, 0)::numeric(16, 3) as total_grams,
  coalesce(line_totals.gross_amount_crc, 0)::numeric(16, 2) as gross_amount_crc,
  coalesce(expense_totals.expenses_crc, 0)::numeric(16, 2) as expenses_crc,
  (coalesce(line_totals.gross_amount_crc, 0) - coalesce(expense_totals.expenses_crc, 0))::numeric(16, 2)
    as net_amount_crc,
  round(
    (coalesce(line_totals.gross_amount_crc, 0) - coalesce(expense_totals.expenses_crc, 0))
      * settlement.participation_percentage / 100,
    2
  )::numeric(16, 2) as participation_amount_crc,
  coalesce(
    settlement.received_amount_crc,
    round(
      (coalesce(line_totals.gross_amount_crc, 0) - coalesce(expense_totals.expenses_crc, 0))
        * settlement.participation_percentage / 100,
      2
    )
  )::numeric(16, 2) as effective_received_amount_crc,
  coalesce(line_totals.lines, '[]'::jsonb) as lines,
  coalesce(expense_totals.expenses, '[]'::jsonb) as expenses
from app.report_settlements as settlement
join app.suppliers as supplier
  on supplier.organization_id = settlement.organization_id
 and supplier.id = settlement.supplier_id
left join lateral (
  select
    sum(line.grams_liquidated) as total_grams,
    sum(line.gross_amount_crc) as gross_amount_crc,
    jsonb_agg(
      jsonb_build_object(
        'id', line.id,
        'shipmentId', line.shipment_id,
        'assayLabel', line.assay_label,
        'karat', line.karat,
        'gramsLiquidated', line.grams_liquidated,
        'pricePerKaratCrc', line.price_per_karat_crc,
        'pricePerGramCrc', line.price_per_gram_crc,
        'grossAmountCrc', line.gross_amount_crc,
        'displayOrder', line.display_order
      ) order by line.display_order
    ) as lines
  from app.report_settlement_lines as line
  where line.organization_id = settlement.organization_id
    and line.settlement_id = settlement.id
) as line_totals on true
left join lateral (
  select
    sum(expense.amount_crc) as expenses_crc,
    jsonb_agg(
      jsonb_build_object(
        'id', expense.id,
        'category', expense.category,
        'concept', expense.concept,
        'amountCrc', expense.amount_crc,
        'occurredOn', expense.occurred_on,
        'responsibleName', expense.responsible_name,
        'displayOrder', expense.display_order
      ) order by expense.display_order
    ) as expenses
  from app.report_settlement_expenses as expense
  where expense.organization_id = settlement.organization_id
    and expense.settlement_id = settlement.id
) as expense_totals on true;

alter table app.report_settlements enable row level security;
alter table app.report_settlement_lines enable row level security;
alter table app.report_settlement_expenses enable row level security;

create policy backend_service_all on app.report_settlements
  for all to service_role using (true) with check (true);
create policy backend_service_all on app.report_settlement_lines
  for all to service_role using (true) with check (true);
create policy backend_service_all on app.report_settlement_expenses
  for all to service_role using (true) with check (true);

revoke all on table app.report_settlements from public, anon, authenticated, service_role;
revoke all on table app.report_settlement_lines from public, anon, authenticated, service_role;
revoke all on table app.report_settlement_expenses from public, anon, authenticated, service_role;
revoke all on table app.management_report_settlements from public, anon, authenticated, service_role;
grant select, insert, update, delete on table app.report_settlements to service_role;
grant select, insert, update, delete on table app.report_settlement_lines to service_role;
grant select, insert, update, delete on table app.report_settlement_expenses to service_role;
grant select on table app.management_report_settlements to service_role;

revoke all on function app.save_report_settlement_v1(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function app.save_report_settlement_v1(jsonb, jsonb, jsonb)
  to service_role;
revoke all on function app.transition_report_settlement_v1(uuid, uuid, integer, text, uuid)
  from public, anon, authenticated;
grant execute on function app.transition_report_settlement_v1(uuid, uuid, integer, text, uuid)
  to service_role;
revoke all on function app.create_report_settlement_correction_v1(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function app.create_report_settlement_correction_v1(uuid, uuid, uuid, uuid)
  to service_role;

insert into app.permissions (id, code, description)
values (
  '10000000-0000-4000-8000-000000000032',
  'reports.manage',
  'Crear, editar, revisar y aprobar liquidaciones financieras gerenciales.'
)
on conflict (id) do update
set code = excluded.code, description = excluded.description, is_active = true;

insert into app.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from app.roles as roles
join app.permissions as permissions on permissions.code = 'reports.manage'
where roles.code = 'JEFE_EMPRESA'
on conflict (role_id, permission_id) do nothing;

comment on table app.report_settlements is
  'Cabecera editable en borrador y bloqueada al aprobarse para liquidaciones financieras de oro.';
comment on table app.report_settlement_lines is
  'Ensayes y precios asociados a cargamentos finalizados; el bruto se calcula con gramos por precio por gramo.';
comment on table app.report_settlement_expenses is
  'Deducciones y gastos por liquidacion, incluidas categorias de planta, salarios y finca.';
