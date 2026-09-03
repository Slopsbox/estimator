create table public.health_check_prototype_results (
  room_id uuid primary key,
  facilitator_user_id uuid not null references auth.users(id) on delete cascade,
  report jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.health_check_prototype_results enable row level security;
revoke all on table public.health_check_prototype_results from public, anon, authenticated, service_role;

alter function public.finalize_health_check_prototype(uuid) set schema private;
revoke execute on function private.finalize_health_check_prototype(uuid)
  from public, anon, authenticated, service_role;

create function public.finalize_health_check_prototype(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_report jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_room_id::text, 0));

  select result.report into v_report
    from public.health_check_prototype_results result
   where result.room_id = p_room_id
     and result.facilitator_user_id = v_user_id
     and result.expires_at > clock_timestamp();
  if found then
    return v_report;
  end if;

  delete from public.health_check_prototype_results result
   where result.room_id = p_room_id
     and result.expires_at <= clock_timestamp();

  v_report := private.finalize_health_check_prototype(p_room_id);
  insert into public.health_check_prototype_results (
    room_id, facilitator_user_id, report, expires_at
  ) values (
    p_room_id, v_user_id, v_report, clock_timestamp() + interval '24 hours'
  );
  return v_report;
end;
$function$;

revoke execute on function public.finalize_health_check_prototype(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_health_check_prototype(uuid) to authenticated;

create or replace function private.cleanup_expired_health_checks()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_cleanup_at timestamptz := clock_timestamp();
begin
  delete from public.health_check_prototype_results
   where expires_at <= v_cleanup_at;

  delete from public.health_check_report_jobs
   where expires_at <= v_cleanup_at
      or exists (
        select 1 from public.health_check_sessions h
         where h.room_id = health_check_report_jobs.source_room_id
           and h.expires_at <= v_cleanup_at
      );

  update public.health_check_report_jobs
     set status = 'failed', claimed_by = null, lease_expires_at = null,
         next_attempt_at = v_cleanup_at
   where status = 'processing'
     and lease_expires_at <= v_cleanup_at
     and expires_at > v_cleanup_at;

  delete from public.sessions s
    using public.health_check_sessions h
   where h.room_id = s.id and h.expires_at <= v_cleanup_at;
end;
$function$;

create or replace function public.create_session(
  p_request_id uuid,
  p_facilitator_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_facilitator_name);
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
  v_round_participant public.round_participants%rowtype;
  v_join_code text;
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_attempt integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select * into v_session
    from public.sessions
   where facilitator_user_id = v_user_id
     and create_request_id = p_request_id
   limit 1;

  if found and v_session.activity_type <> 'estimation' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;

  if found and v_session.status = 'active' then
    select * into strict v_participant
      from public.participants
     where session_id = v_session.id and user_id = v_user_id;

    select * into v_round_participant
      from public.round_participants
     where session_id = v_session.id
       and round = v_session.current_round
       and participant_id = v_participant.id;

    return jsonb_build_object(
      'status', 'ok',
      'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id',
      'participant', to_jsonb(v_participant) - 'user_id',
      'round_participant', to_jsonb(v_round_participant)
    );
  end if;

  if found then
    raise exception 'request_already_used' using errcode = '22023';
  end if;

  select * into v_session
    from public.sessions
   where facilitator_user_id = v_user_id
     and status = 'active'
     and activity_type = 'estimation'
   order by (create_request_id = p_request_id) desc, created_at desc
   limit 1;

  if found then
    select * into strict v_participant
      from public.participants
     where session_id = v_session.id and user_id = v_user_id;

    select * into v_round_participant
      from public.round_participants
     where session_id = v_session.id
       and round = v_session.current_round
       and participant_id = v_participant.id;

    return jsonb_build_object(
      'status', 'active_session_exists',
      'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id',
      'participant', to_jsonb(v_participant) - 'user_id',
      'round_participant', to_jsonb(v_round_participant)
    );
  end if;

  if p_request_id is null then
    raise exception 'request_id_required' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  for v_attempt in 1..32 loop
    v_join_code := '';
    for v_position in 1..4 loop
      v_join_code := v_join_code || substr(
        v_alphabet,
        1 + (get_byte(uuid_send(gen_random_uuid()), v_position - 1) % char_length(v_alphabet)),
        1
      );
    end loop;

    begin
      insert into public.sessions (
        status, current_round, join_code, votes_revealed, started,
        consensus_streak, facilitator_user_id, create_request_id, activity_type
      ) values (
        'active', 1, v_join_code, false, false, 0,
        v_user_id, p_request_id, 'estimation'
      ) returning * into v_session;
      exit;
    exception when unique_violation then
      if v_attempt = 32 then
        raise exception 'join_code_generation_exhausted';
      end if;
    end;
  end loop;

  insert into public.participants (session_id, name, role, user_id)
  values (v_session.id, v_name, 'facilitator', v_user_id)
  returning * into v_participant;

  insert into public.round_participants (session_id, round, participant_id)
  values (v_session.id, 1, v_participant.id)
  returning * into v_round_participant;

  return jsonb_build_object(
    'status', 'ok',
    'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id',
    'participant', to_jsonb(v_participant) - 'user_id',
    'round_participant', to_jsonb(v_round_participant)
  );
end;
$function$;

revoke execute on function public.create_session(uuid, text) from public, anon;
grant execute on function public.create_session(uuid, text) to authenticated;

do $schedule$
declare
  v_existing_job_id bigint;
begin
  select jobid into v_existing_job_id
    from cron.job
   where jobname = 'cleanup-expired-health-check-prototype-results';
  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  perform cron.schedule(
    'cleanup-expired-health-check-prototype-results',
    '17 * * * *',
    'delete from public.health_check_prototype_results where expires_at <= clock_timestamp()'
  );
end;
$schedule$;
