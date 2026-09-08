-- Cinco fallos bloquean 15 minutos; un segundo bloqueo en 24 h exige reset.

do $$
declare
  result jsonb;
  attempt integer;
begin
  for attempt in 1..5 loop
    result := app.record_pin_attempt(
      '30000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      false,
      '2026-01-20T00:00:00Z'::timestamptz + (attempt * interval '1 second')
    );
  end loop;
  if result ->> 'result' <> 'BLOCKED' then
    raise exception 'fifth failure must block elevation';
  end if;

  result := app.record_pin_attempt(
    '30000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    true,
    '2026-01-20T00:10:00Z'
  );
  if result ->> 'result' <> 'BLOCKED' then
    raise exception 'block must remain active during cooldown';
  end if;

  for attempt in 1..5 loop
    result := app.record_pin_attempt(
      '30000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
      false,
      '2026-01-20T00:16:00Z'::timestamptz + (attempt * interval '1 second')
    );
  end loop;
  if result ->> 'result' <> 'RESET_REQUIRED' then
    raise exception 'second block in 24 hours must require reset';
  end if;

  perform app.reset_pin_blocks(
    '30000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    '2026-01-20T00:20:00Z'
  );
  result := app.record_pin_attempt(
    '30000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    true,
    '2026-01-20T00:21:00Z'
  );
  if result ->> 'result' <> 'ACCEPTED' then
    raise exception 'full authentication reset must restore elevation';
  end if;
end;
$$;
