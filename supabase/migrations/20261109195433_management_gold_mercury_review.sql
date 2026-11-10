create table app.shipment_gold_review_entries (
  id uuid primary key,
  organization_id uuid not null,
  shipment_id uuid not null,
  disposition text not null,
  recorded_at_utc timestamptz not null,
  recorded_by_profile_id uuid not null,
  supersedes_entry_id uuid,
  reason text,
  created_at timestamptz not null default now(),
  constraint shipment_gold_review_entries_organization_id_id_unique
    unique (organization_id, id),
  constraint shipment_gold_review_entries_shipment_fk
    foreign key (organization_id, shipment_id)
    references app.shipments (organization_id, id) on delete restrict,
  constraint shipment_gold_review_entries_recorded_by_fk
    foreign key (organization_id, recorded_by_profile_id)
    references app.user_profiles (organization_id, id) on delete restrict,
  constraint shipment_gold_review_entries_supersedes_fk
    foreign key (organization_id, supersedes_entry_id)
    references app.shipment_gold_review_entries (organization_id, id)
    on delete restrict,
  constraint shipment_gold_review_entries_disposition_check
    check (disposition in ('PENDING', 'OMITTED')),
  constraint shipment_gold_review_entries_reason_check check (
    (disposition = 'OMITTED' and reason is not null and btrim(reason) <> '')
    or disposition = 'PENDING'
  ),
  constraint shipment_gold_review_entries_distinct_correction_check
    check (supersedes_entry_id is null or supersedes_entry_id <> id)
);

create unique index ux_shipment_gold_review_initial
  on app.shipment_gold_review_entries (organization_id, shipment_id)
  where supersedes_entry_id is null;
create unique index ux_shipment_gold_review_superseded_once
  on app.shipment_gold_review_entries (organization_id, supersedes_entry_id)
  where supersedes_entry_id is not null;
create index ix_shipment_gold_review_supersedes
  on app.shipment_gold_review_entries (organization_id, supersedes_entry_id);
create index ix_shipment_gold_review_shipment_time
  on app.shipment_gold_review_entries (
    organization_id, shipment_id, recorded_at_utc desc, id desc
  );
create index ix_shipment_gold_review_recorded_by
  on app.shipment_gold_review_entries (
    organization_id, recorded_by_profile_id
  );

create function app.validate_shipment_gold_review_entry()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  previous app.shipment_gold_review_entries%rowtype;
begin
  if new.supersedes_entry_id is not null then
    select entries.* into previous
    from app.shipment_gold_review_entries as entries
    where entries.organization_id = new.organization_id
      and entries.id = new.supersedes_entry_id;

    if not found or previous.shipment_id <> new.shipment_id then
      raise exception using
        errcode = '23514',
        message = 'GOLD_REVIEW_CONTEXT_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_validate_shipment_gold_review_entry
before insert on app.shipment_gold_review_entries
for each row execute function app.validate_shipment_gold_review_entry();

create trigger trg_shipment_gold_review_append_only
before update or delete on app.shipment_gold_review_entries
for each row execute function app.reject_sprint_4_history_mutation();

alter table app.shipment_gold_review_entries enable row level security;
revoke all on table app.shipment_gold_review_entries
  from public, anon, authenticated;
grant select, insert on table app.shipment_gold_review_entries to service_role;

create view app.management_current_gold_review
with (security_invoker = true)
as
select
  entries.organization_id,
  entries.shipment_id,
  entries.id as review_entry_id,
  entries.disposition,
  entries.recorded_at_utc,
  entries.recorded_by_profile_id,
  entries.reason
from app.shipment_gold_review_entries as entries
where not exists (
  select 1
  from app.shipment_gold_review_entries as correction
  where correction.organization_id = entries.organization_id
    and correction.supersedes_entry_id = entries.id
);

revoke all on table app.management_current_gold_review
  from public, anon, authenticated;
grant select on table app.management_current_gold_review to service_role;

create or replace view app.management_sweep_mercury
with (security_invoker = true)
as
with current_movements as (
  select movements.*
  from app.mercury_movements as movements
  where movements.movement_kind in ('SWEEP_INPUT', 'SWEEP_REMAINDER')
    and not exists (
      select 1
      from app.mercury_movements as correction
      where correction.organization_id = movements.organization_id
        and correction.supersedes_movement_id = movements.id
    )
)
select
  sweeps.organization_id,
  sweeps.shipment_id,
  sweeps.id as sweep_id,
  sweeps.swept_at_utc,
  sweeps.cajuela_count,
  components.id as line_component_id,
  components.name as line_component_name,
  components.display_order as line_component_order,
  max(current_movements.amount_grams)
    filter (where current_movements.movement_kind = 'SWEEP_INPUT') as input_grams,
  max(current_movements.amount_grams)
    filter (where current_movements.movement_kind = 'SWEEP_REMAINDER') as remainder_grams,
  bool_or(current_movements.movement_kind = 'SWEEP_INPUT') as has_input_record,
  bool_or(current_movements.movement_kind = 'SWEEP_REMAINDER') as has_remainder_record,
  (
    min(current_movements.id::text)
      filter (where current_movements.movement_kind = 'SWEEP_INPUT')
  )::uuid as input_movement_id,
  (
    min(current_movements.id::text)
      filter (where current_movements.movement_kind = 'SWEEP_REMAINDER')
  )::uuid as remainder_movement_id
from app.production_sweeps as sweeps
join app.line_components as components
  on components.organization_id = sweeps.organization_id
 and components.production_line_id = sweeps.production_line_id
join app.line_component_types as component_types
  on component_types.id = components.component_type_id
 and component_types.code = 'RASTRA'
left join current_movements
  on current_movements.organization_id = sweeps.organization_id
 and current_movements.shipment_id = sweeps.shipment_id
 and current_movements.sweep_id = sweeps.id
 and current_movements.line_component_id = components.id
group by
  sweeps.organization_id,
  sweeps.shipment_id,
  sweeps.id,
  sweeps.swept_at_utc,
  sweeps.cajuela_count,
  components.id,
  components.name,
  components.display_order;

comment on table app.shipment_gold_review_entries is
  'Append-only management disposition for completed shipments without a gold result.';
comment on view app.management_current_gold_review is
  'Current management disposition used to distinguish pending gold from reviewed without data.';
