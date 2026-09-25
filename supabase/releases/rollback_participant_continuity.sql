-- Controlled behavior rollback for participant_continuity.
-- This cannot undo rooms explicitly ended/aborted while the feature was active.
-- It refuses to discard facilitator-removal decisions.
begin;

lock table public.sessions in access exclusive mode;
lock table public.health_check_sessions in access exclusive mode;
lock table public.participants in access exclusive mode;

do $preflight$
begin
  if exists (select 1 from public.participants where removed_at is not null) then
    raise exception
      'Rollback aborted: removed estimation memberships require explicit reconciliation';
  end if;
end;
$preflight$;

drop function public.deactivate_estimation_participant(uuid, uuid);
drop function public.create_session(uuid, text, boolean);
drop function public.join_session(text, text, boolean);
drop function public.create_health_check_room_prototype(uuid, text, text, date, uuid, boolean);
drop function public.create_health_check_room(uuid, uuid, text, text, date, uuid, boolean);
drop function public.join_health_check_room(uuid, text, text, boolean);

alter function private.create_health_check_room(uuid, uuid, text, text, date, uuid)
  set schema public;
alter function private.join_health_check_room(uuid, text, text)
  set schema public;

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

revoke execute on function public.create_session(uuid, text) from public, anon, service_role;
revoke execute on function public.join_session(text, text) from public, anon, service_role;
revoke execute on function public.create_health_check_room_prototype(uuid, text, text, date, uuid)
  from public, anon, service_role;
revoke execute on function public.create_health_check_room(uuid, uuid, text, text, date, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.join_health_check_room(uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.create_session(uuid, text) to authenticated;
grant execute on function public.join_session(text, text) to authenticated;
grant execute on function public.create_health_check_room_prototype(uuid, text, text, date, uuid)
  to authenticated;
grant execute on function public.create_health_check_room(uuid, uuid, text, text, date, uuid)
  to service_role;
grant execute on function public.join_health_check_room(uuid, text, text)
  to service_role;

create or replace function public.restore_active_health_check_for_facilitator()
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
    from public.health_check_sessions where room_id = v_session.id;
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

create or replace function public.restore_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
  v_vote public.votes%rowtype;
  v_round_participant public.round_participants%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_session_id is null then
    return jsonb_build_object('status', 'membership_missing');
  end if;

  select p.* into v_participant
    from public.participants p
    join public.sessions s on s.id = p.session_id
   where p.session_id = p_session_id
     and p.user_id = v_user_id
     and p.left_at is null
     and (
       s.activity_type = 'estimation'
       or exists (
         select 1 from public.health_check_sessions h
          where h.room_id = s.id and h.expires_at > clock_timestamp()
       )
     );
  if not found then
    return jsonb_build_object('status', 'membership_missing');
  end if;

  select * into strict v_session from public.sessions where id = p_session_id;
  if v_session.activity_type = 'estimation' then
    select * into v_vote from public.votes
     where session_id = p_session_id and round = v_session.current_round
       and participant_id = v_participant.id;
    select * into v_round_participant from public.round_participants
     where session_id = p_session_id and round = v_session.current_round
       and participant_id = v_participant.id;
  end if;

  return jsonb_build_object(
    'status', case
      when v_session.activity_type = 'estimation' and v_session.status = 'completed'
        then 'session_completed'
      else 'ok'
    end,
    'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id',
    'participant', to_jsonb(v_participant) - 'user_id',
    'vote', to_jsonb(v_vote),
    'round_participant', to_jsonb(v_round_participant)
  );
end;
$function$;

create or replace function public.leave_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
  v_health_phase text;
  v_health_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select s.* into v_session
    from public.sessions s
   where s.id = p_session_id
     and (
       s.activity_type = 'estimation'
       or exists (select 1 from public.health_check_sessions h where h.room_id = s.id)
     )
     and exists (
       select 1 from public.participants p
        where p.session_id = s.id
          and p.user_id = v_user_id
          and p.left_at is null
          and p.role <> 'facilitator'
     )
   for update;

  if not found then
    if exists (
      select 1 from public.participants p
       where p.session_id = p_session_id
         and p.user_id = v_user_id
         and p.left_at is null
         and p.role = 'facilitator'
         and exists (
           select 1 from public.sessions s
            where s.id = p.session_id
              and (
                s.activity_type = 'estimation'
                or exists (
                  select 1 from public.health_check_sessions h
                   where h.room_id = s.id and h.expires_at > clock_timestamp()
                )
              )
         )
    ) then
      raise exception 'facilitator_cannot_leave' using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'membership_missing');
  end if;

  if v_session.activity_type = 'health_check' then
    select phase, expires_at into strict v_health_phase, v_health_expires_at
      from public.health_check_sessions where room_id = p_session_id;
    if v_health_expires_at <= clock_timestamp() then
      return jsonb_build_object('status', 'membership_missing');
    end if;
    if v_health_phase <> 'lobby' then
      raise exception 'health_check_leave_locked' using errcode = '42501';
    end if;
  end if;

  select * into strict v_participant
    from public.participants
   where session_id = p_session_id and user_id = v_user_id and left_at is null;

  update public.participants set left_at = now() where id = v_participant.id;

  if v_session.activity_type = 'estimation' then
    delete from public.round_participants rp
     where rp.session_id = p_session_id
       and rp.round = v_session.current_round
       and rp.participant_id = v_participant.id
       and not exists (
         select 1 from public.votes v
          where v.session_id = rp.session_id
            and v.round = rp.round
            and v.participant_id = rp.participant_id
       );
  end if;
  return jsonb_build_object('status', 'ok');
end;
$function$;

create or replace function public.reveal_votes(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_eligible_count integer;
  v_vote_count integer;
  v_distinct_sizes integer;
  v_min_value_score integer;
  v_max_value_score integer;
  v_consensus boolean;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select * into v_session
    from public.sessions
   where id = p_session_id
     and facilitator_user_id = v_user_id
     and exists (
       select 1 from public.participants
        where session_id = p_session_id and user_id = v_user_id
          and left_at is null and role = 'facilitator'
     )
   for update;
  if not found then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'estimation' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  if v_session.status <> 'active' or not v_session.started then
    raise exception 'session_not_started';
  end if;
  if v_session.votes_revealed then
    return jsonb_build_object(
      'status', 'already_revealed',
      'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id'
    );
  end if;

  select count(*) into v_eligible_count
    from public.round_participants rp
    join public.participants p
      on p.id = rp.participant_id and p.session_id = rp.session_id
   where rp.session_id = p_session_id
     and rp.round = v_session.current_round
     and p.role = 'participant';

  select count(*), count(distinct v.size),
         min(case v.value when 'bronze' then 0 when 'silver' then 1 when 'gold' then 2 end),
         max(case v.value when 'bronze' then 0 when 'silver' then 1 when 'gold' then 2 end)
    into v_vote_count, v_distinct_sizes, v_min_value_score, v_max_value_score
    from public.votes v
    join public.round_participants rp
      on rp.session_id = v.session_id and rp.round = v.round
     and rp.participant_id = v.participant_id
    join public.participants p
      on p.session_id = rp.session_id and p.id = rp.participant_id
     and p.role = 'participant'
   where v.session_id = p_session_id
     and v.round = v_session.current_round;

  v_consensus := v_eligible_count > 0
    and v_vote_count = v_eligible_count
    and v_distinct_sizes = 1
    and v_max_value_score - v_min_value_score < 2;

  update public.sessions
     set votes_revealed = true,
         consensus_streak = case when v_consensus then consensus_streak + 1 else 0 end
   where id = p_session_id
  returning * into v_session;

  return jsonb_build_object(
    'status', 'ok', 'consensus', v_consensus,
    'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id'
  );
end;
$function$;

create or replace function public.get_round_vote_statuses(p_session_id uuid, p_round integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select s.* into v_session
    from public.sessions s
    join public.participants facilitator
      on facilitator.session_id = s.id
     and facilitator.user_id = v_user_id
     and facilitator.role = 'facilitator'
     and facilitator.left_at is null
   where s.id = p_session_id
     and s.facilitator_user_id = v_user_id;
  if not found then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'estimation' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  if p_round is distinct from v_session.current_round then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'participant_id', rp.participant_id,
    'has_voted', exists (
      select 1 from public.votes v
       where v.session_id = rp.session_id and v.round = rp.round
         and v.participant_id = rp.participant_id
    )
  ) order by rp.joined_at), '[]'::jsonb)
    into v_result
    from public.round_participants rp
    join public.participants p
      on p.session_id = rp.session_id and p.id = rp.participant_id
     and p.role = 'participant'
   where rp.session_id = p_session_id and rp.round = p_round;
  return v_result;
end;
$function$;

create or replace function public.get_health_check_state(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select s.* into v_session from public.sessions s
   where s.id = p_room_id
     and exists (select 1 from public.health_check_sessions h where h.room_id = s.id and h.expires_at > clock_timestamp())
     and exists (select 1 from public.participants p where p.session_id = s.id and p.user_id = v_user_id and p.left_at is null);
  if not found then raise exception 'membership_required' using errcode = '42501'; end if;
  if v_session.activity_type <> 'health_check' then raise exception 'wrong_activity_type' using errcode = '22023'; end if;
  select p.* into strict v_participant from public.participants p
   where p.session_id = p_room_id and p.user_id = v_user_id and p.left_at is null;
  select jsonb_build_object(
    'phase', h.phase, 'template_version', h.template_version,
    'squad_name', h.squad_name, 'measurement_date', h.measurement_date,
    'respondent_state', r.state, 'role', p.role, 'expires_at', h.expires_at
  ) into v_result
    from public.sessions s
    join public.health_check_sessions h on h.room_id = s.id
    join public.participants p on p.id = v_participant.id and p.session_id = s.id
    left join public.health_check_respondents r on r.room_id = s.id and r.member_id = p.id
   where s.id = p_room_id;
  return v_result;
end;
$function$;

create or replace function public.remove_health_check_respondent(p_room_id uuid, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_health public.health_check_sessions%rowtype;
  v_state text;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select s.* into v_session from public.sessions s
   where s.id = p_room_id and s.facilitator_user_id = v_user_id
     and exists (select 1 from public.participants p where p.session_id = s.id and p.user_id = v_user_id and p.left_at is null and p.role = 'facilitator')
   for update;
  if not found then raise exception 'facilitator_required' using errcode = '42501'; end if;
  if v_session.activity_type <> 'health_check' then raise exception 'wrong_activity_type' using errcode = '22023'; end if;
  select * into strict v_health from public.health_check_sessions where room_id = p_room_id;
  if v_health.expires_at <= clock_timestamp() then raise exception 'facilitator_required' using errcode = '42501'; end if;
  if v_health.phase = 'download_pending' then raise exception 'health_check_removal_locked' using errcode = '22023'; end if;
  if v_health.phase = 'collecting' then
    select state into v_state from public.health_check_respondents where room_id = p_room_id and member_id = p_member_id;
    if not found then raise exception 'respondent_not_found' using errcode = '22023'; end if;
    if v_state = 'completed' then raise exception 'completed_respondent_locked' using errcode = '22023'; end if;
    delete from public.health_check_respondents where room_id = p_room_id and member_id = p_member_id and state = 'in_progress';
  end if;
  update public.participants set left_at = statement_timestamp()
   where session_id = p_room_id and id = p_member_id and role = 'participant' and left_at is null;
  if not found then raise exception 'respondent_not_found' using errcode = '22023'; end if;
  return jsonb_build_object('status', 'removed');
end;
$function$;

drop trigger sessions_clear_continuity_markers on public.sessions;
drop trigger participants_maintain_continuity_marker on public.participants;
drop function private.clear_completed_session_continuity_markers();
drop function private.maintain_participant_continuity_marker();
drop function private.prepare_active_room_transition(uuid, uuid, boolean);

drop index public.participants_one_active_room_per_user_uidx;
drop index public.sessions_one_active_facilitator_uidx;
create unique index sessions_one_active_facilitator_activity_uidx
  on public.sessions(facilitator_user_id, activity_type)
  where facilitator_user_id is not null and status = 'active';

alter table public.participants
  drop constraint participants_active_room_identity_check,
  drop column active_room_user_id,
  drop column removed_at;

commit;
