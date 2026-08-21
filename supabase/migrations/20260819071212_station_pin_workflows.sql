-- Estado central de intentos de PIN para la elevacion temporal de la estacion.
-- Version aplicada en Supabase de desarrollo: 20260819071212.

alter table app.user_pin_credentials
  add column last_blocked_at timestamptz;

create function app.record_pin_attempt(
  target_organization_id uuid,
  target_profile_id uuid,
  verification_succeeded boolean,
  observed_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
declare
  credential app.user_pin_credentials%rowtype;
  next_count integer;
  result_code text;
begin
  select * into credential
  from app.user_pin_credentials
  where organization_id = target_organization_id
    and user_profile_id = target_profile_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'PIN_CREDENTIAL_NOT_FOUND';
  end if;

  if credential.reset_required then
    return jsonb_build_object('result', 'RESET_REQUIRED');
  end if;

  if credential.blocked_until is not null and credential.blocked_until > observed_at then
    return jsonb_build_object('result', 'BLOCKED', 'blockedUntil', credential.blocked_until);
  end if;

  if verification_succeeded then
    update app.user_pin_credentials set
      failed_attempt_count = 0,
      attempt_window_started_at = null,
      blocked_until = null,
      last_success_at = observed_at,
      updated_at = observed_at
    where id = credential.id;
    return jsonb_build_object('result', 'ACCEPTED');
  end if;

  if credential.attempt_window_started_at is null
     or credential.attempt_window_started_at <= observed_at - interval '15 minutes' then
    next_count := 1;
  else
    next_count := credential.failed_attempt_count + 1;
  end if;

  if next_count >= 5 then
    if credential.last_blocked_at is not null
       and credential.last_blocked_at > observed_at - interval '24 hours' then
      update app.user_pin_credentials set
        failed_attempt_count = 0,
        attempt_window_started_at = null,
        blocked_until = null,
        reset_required = true,
        second_block_requires_reset = true,
        last_blocked_at = observed_at,
        updated_at = observed_at
      where id = credential.id;
      result_code := 'RESET_REQUIRED';
    else
      update app.user_pin_credentials set
        failed_attempt_count = 0,
        attempt_window_started_at = null,
        blocked_until = observed_at + interval '15 minutes',
        last_blocked_at = observed_at,
        updated_at = observed_at
      where id = credential.id;
      result_code := 'BLOCKED';
    end if;
  else
    update app.user_pin_credentials set
      failed_attempt_count = next_count,
      attempt_window_started_at = case
        when credential.attempt_window_started_at is null
          or credential.attempt_window_started_at <= observed_at - interval '15 minutes'
        then observed_at else credential.attempt_window_started_at end,
      blocked_until = null,
      updated_at = observed_at
    where id = credential.id;
    result_code := 'REJECTED';
  end if;

  return jsonb_build_object(
    'result', result_code,
    'remainingAttempts', greatest(0, 5 - next_count),
    'blockedUntil', case when result_code = 'BLOCKED' then observed_at + interval '15 minutes' else null end
  );
end;
$$;

create function app.reset_pin_blocks(
  target_organization_id uuid,
  target_profile_id uuid,
  observed_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, app
as $$
begin
  update app.user_pin_credentials set
    failed_attempt_count = 0,
    attempt_window_started_at = null,
    blocked_until = null,
    reset_required = false,
    second_block_requires_reset = false,
    updated_at = observed_at
  where organization_id = target_organization_id
    and user_profile_id = target_profile_id;
  if not found then
    raise exception using errcode = '23503', message = 'PIN_CREDENTIAL_NOT_FOUND';
  end if;
end;
$$;

revoke all on function app.record_pin_attempt(uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function app.reset_pin_blocks(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function app.record_pin_attempt(uuid, uuid, boolean, timestamptz) to service_role;
grant execute on function app.reset_pin_blocks(uuid, uuid, timestamptz) to service_role;
