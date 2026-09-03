do $preflight$
declare
  v_expected_policies jsonb := jsonb_build_array(
    jsonb_build_object(
      'table', 'sessions',
      'qual', '(SELECTprivate.is_session_member(sessions.id)ASis_session_member)'
    ),
    jsonb_build_object(
      'table', 'participants',
      'qual', '(SELECTprivate.is_session_member(participants.session_id)ASis_session_member)'
    ),
    jsonb_build_object(
      'table', 'votes',
      'qual', '(SELECTprivate.can_read_vote(votes.session_id,votes.participant_id,votes.round)AScan_read_vote)'
    ),
    jsonb_build_object(
      'table', 'round_participants',
      'qual', '(SELECTprivate.is_session_member(round_participants.session_id)ASis_session_member)'
    )
  );
begin
  if not coalesce((
    select bool_and(c.relrowsecurity)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('sessions', 'participants', 'votes', 'round_participants')
    having count(*) = 4
  ), false) or exists (
    select 1
      from jsonb_array_elements(v_expected_policies) expected
     where (
       select count(*)
         from pg_policies policy
        where policy.schemaname = 'public'
          and policy.tablename = expected->>'table'
          and policy.cmd = 'SELECT'
          and policy.permissive = 'PERMISSIVE'
          and policy.roles = array['authenticated'::name]
          and regexp_replace(coalesce(policy.qual, ''), '\s+', '', 'g') = expected->>'qual'
     ) <> 1
  ) or (
    select count(*) from pg_policies
     where schemaname = 'public'
       and tablename in ('sessions', 'participants', 'votes', 'round_participants')
  ) <> 4 or exists (
    select 1
      from unnest(array['sessions', 'participants', 'votes', 'round_participants']) as tables(table_name)
     where has_table_privilege('anon', format('public.%I', tables.table_name), 'SELECT')
  ) then
    raise exception 'turnstile_requires_member_scoped_room_rls' using errcode = '55000';
  end if;
end;
$preflight$;

create table private.turnstile_attestations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  verified_until timestamptz not null,
  created_at timestamptz not null default now()
);

revoke all on table private.turnstile_attestations
  from public, anon, authenticated, service_role;

create function private.require_recent_turnstile()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from private.turnstile_attestations attestation
     where attestation.user_id = auth.uid()
       and attestation.verified_until > clock_timestamp()
  ) then
    raise exception 'turnstile_required' using errcode = '42501';
  end if;
end;
$function$;

create function public.attest_turnstile_for_service(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    return false;
  end if;

  delete from private.turnstile_attestations
   where verified_until <= clock_timestamp();

  insert into private.turnstile_attestations (user_id, verified_until)
  values (p_user_id, clock_timestamp() + interval '15 minutes')
  on conflict (user_id) do update
    set verified_until = excluded.verified_until,
        created_at = clock_timestamp();
  return true;
end;
$function$;

alter function public.create_session(uuid, text) set schema private;
alter function public.join_session(text, text) set schema private;
alter function public.create_health_check_room_prototype(uuid, text, text, date, uuid) set schema private;

revoke execute on function private.create_session(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function private.join_session(text, text) from public, anon, authenticated, service_role;
revoke execute on function private.create_health_check_room_prototype(uuid, text, text, date, uuid)
  from public, anon, authenticated, service_role;

create function public.create_session(p_request_id uuid, p_facilitator_name text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform private.require_recent_turnstile();
  return private.create_session(p_request_id, p_facilitator_name);
end;
$function$;

create function public.join_session(p_join_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform private.require_recent_turnstile();
  return private.join_session(p_join_code, p_name);
end;
$function$;

create function public.create_health_check_room_prototype(
  p_request_id uuid,
  p_facilitator_name text,
  p_squad_name text,
  p_measurement_date date,
  p_delivery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform private.require_recent_turnstile();
  return private.create_health_check_room_prototype(
    p_request_id, p_facilitator_name, p_squad_name, p_measurement_date, p_delivery_id
  );
end;
$function$;

revoke execute on function private.require_recent_turnstile()
  from public, anon, authenticated, service_role;
revoke execute on function public.attest_turnstile_for_service(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.create_session(uuid, text) from public, anon, service_role;
revoke execute on function public.join_session(text, text) from public, anon, service_role;
revoke execute on function public.create_health_check_room_prototype(uuid, text, text, date, uuid)
  from public, anon, service_role;

grant execute on function public.attest_turnstile_for_service(uuid) to service_role;
grant execute on function public.create_session(uuid, text) to authenticated;
grant execute on function public.join_session(text, text) to authenticated;
grant execute on function public.create_health_check_room_prototype(uuid, text, text, date, uuid)
  to authenticated;

create function public.restore_active_health_check_for_facilitator()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_health public.health_check_sessions%rowtype;
  v_participant public.participants%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select s.* into v_session
    from public.sessions s
    join public.health_check_sessions h on h.room_id = s.id
   where s.facilitator_user_id = v_user_id
     and s.status = 'active'
     and s.activity_type = 'health_check'
     and h.expires_at > clock_timestamp()
   order by s.created_at desc
   limit 1
   for update of s;
  if not found then
    return jsonb_build_object('status', 'session_not_found');
  end if;

  select * into strict v_health
    from public.health_check_sessions
   where room_id = v_session.id;

  select * into strict v_participant
    from public.participants
   where session_id = v_session.id
     and user_id = v_user_id
     and role = 'facilitator'
     and left_at is null;

  return jsonb_build_object(
    'status', 'ok',
    'session', jsonb_build_object(
      'id', v_session.id, 'activity_type', v_session.activity_type,
      'status', v_session.status, 'join_code', v_session.join_code,
      'created_at', v_session.created_at, 'phase', v_health.phase,
      'template_version', v_health.template_version,
      'squad_name', v_health.squad_name,
      'measurement_date', v_health.measurement_date,
      'expires_at', v_health.expires_at
    ),
    'participant', to_jsonb(v_participant) - 'user_id'
  );
end;
$function$;

revoke execute on function public.restore_active_health_check_for_facilitator()
  from public, anon, service_role;
grant execute on function public.restore_active_health_check_for_facilitator() to authenticated;
