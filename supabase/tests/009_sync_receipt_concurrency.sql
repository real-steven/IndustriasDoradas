-- Verifica que el RPC publico tome un bloqueo transaccional por clave
-- idempotente y que la implementacion sin bloqueo no quede expuesta.

do $$
declare
  wrapper_definition text;
  missing_unique_constraints integer;
begin
  select pg_get_functiondef('app.ingest_sync_item_v1(jsonb)'::regprocedure)
    into wrapper_definition;

  if position('pg_advisory_xact_lock' in wrapper_definition) = 0 then
    raise exception 'sync wrapper must acquire a transaction advisory lock';
  end if;

  if has_function_privilege('anon', 'app.ingest_sync_item_v1(jsonb)', 'execute')
     or has_function_privilege(
       'authenticated',
       'app.ingest_sync_item_v1(jsonb)',
       'execute'
     ) then
    raise exception 'sync wrapper must not be executable by public clients';
  end if;

  if has_function_privilege(
       'anon',
       'app.ingest_sync_item_v1_unlocked(jsonb)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'app.ingest_sync_item_v1_unlocked(jsonb)',
       'execute'
     ) then
    raise exception 'unlocked implementation must remain internal';
  end if;

  if not has_function_privilege(
    'service_role',
    'app.ingest_sync_item_v1(jsonb)',
    'execute'
  ) then
    raise exception 'service role must execute the guarded sync wrapper';
  end if;

  select count(*)
    into missing_unique_constraints
  from (
    values
      ('sync_receipts_station_sequence_unique'),
      ('production_events_station_client_sequence_unique')
  ) as expected(name)
  where not exists (
    select 1
    from pg_constraint constraints
    join pg_namespace schemas on schemas.oid = constraints.connamespace
    where schemas.nspname = 'app'
      and constraints.conname = expected.name
      and constraints.contype = 'u'
  );

  if missing_unique_constraints <> 0 then
    raise exception 'central sequence uniqueness constraints are missing';
  end if;

  if not exists (
    select 1
    from pg_indexes indexes
    where indexes.schemaname = 'app'
      and indexes.indexname = 'ux_production_events_reversal_target'
      and indexes.indexdef like 'CREATE UNIQUE INDEX%'
  ) then
    raise exception 'only one effective reversal may target an event';
  end if;
end;
$$;
