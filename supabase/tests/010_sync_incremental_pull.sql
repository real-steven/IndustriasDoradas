do $$
declare
  before_count integer;
  after_count integer;
  last_change record;
begin
  select count(*) into before_count from app.sync_changes;
  if before_count < 28 then
    raise exception 'bootstrap feed must contain seeded catalog and station rows';
  end if;

  update app.suppliers
  set is_active = false,
      deactivated_at = now()
  where id = '35000000-0000-4000-8000-000000000001';

  select count(*) into after_count from app.sync_changes;
  if after_count <> before_count + 1 then
    raise exception 'supplier update must append exactly one sync change';
  end if;

  select entity_type, entity_id, action, payload ->> 'is_active' active_value
    into last_change
  from app.sync_changes
  order by server_sequence desc
  limit 1;

  if last_change.entity_type <> 'SUPPLIER'
     or last_change.entity_id <> '35000000-0000-4000-8000-000000000001'
     or last_change.action <> 'DEACTIVATE'
     or last_change.active_value <> 'false' then
    raise exception 'deactivation change does not preserve the authoritative row';
  end if;

  if exists (
    select 1
    from app.sync_changes
    group by server_sequence
    having count(*) > 1
  ) then
    raise exception 'server sequence must be unique';
  end if;
end;
$$;

set role authenticated;
do $$
begin
  begin
    perform 1 from app.sync_changes limit 1;
    raise exception 'authenticated must not read the pull feed directly';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
