-- Impide introducir claves foraneas sin un indice que comience por las
-- mismas columnas y en el mismo orden.

do $$
declare
  missing_constraints text;
begin
  select string_agg(constraints.conname, ', ' order by constraints.conname)
    into missing_constraints
  from pg_constraint constraints
  join pg_namespace schemas on schemas.oid = constraints.connamespace
  where schemas.nspname = 'app'
    and constraints.contype = 'f'
    and not exists (
      select 1
      from pg_index indexes
      where indexes.indrelid = constraints.conrelid
        and indexes.indisvalid
        and indexes.indpred is null
        and (
          select array_agg(index_columns.attnum order by index_columns.ordinality)
          from unnest(indexes.indkey::smallint[]) with ordinality
            as index_columns(attnum, ordinality)
          where index_columns.ordinality <= cardinality(constraints.conkey)
        ) = constraints.conkey
    );

  if missing_constraints is not null then
    raise exception 'foreign keys without supporting indexes: %', missing_constraints;
  end if;
end;
$$;
