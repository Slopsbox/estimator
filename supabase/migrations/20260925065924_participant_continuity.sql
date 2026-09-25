-- Enforce one effective active room per authenticated anonymous identity.
-- Existing historical memberships remain intact; only an explicit takeover may
-- end/abort/leave an unexpired active room.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '5min';
lock table public.sessions in access exclusive mode;
lock table public.health_check_sessions in access exclusive mode;
lock table public.participants in access exclusive mode;

alter table public.participants
  add column active_room_user_id uuid references auth.users(id) on delete set null,
  add column removed_at timestamptz,
  add constraint participants_active_room_identity_check check (
    active_room_user_id is null or active_room_user_id = user_id
  );

-- Expired health rooms are already inaccessible. Retire their session status so
-- they cannot consume the facilitator quota while waiting for scheduled cleanup.
update public.sessions s
   set status = 'completed'
  from public.health_check_sessions h
 where h.room_id = s.id
   and s.status = 'active'
   and h.expires_at <= clock_timestamp();

do $preflight$
begin
  if exists (
    select p.user_id
      from public.participants p
      join public.sessions s on s.id = p.session_id
      left join public.health_check_sessions h on h.room_id = s.id
     where p.user_id is not null
       and p.left_at is null
       and s.status = 'active'
       and (s.activity_type = 'estimation' or h.expires_at > clock_timestamp())
     group by p.user_id
    having count(*) > 1
  ) then
    raise exception 'participant_continuity_requires_active_membership_reconciliation'
      using errcode = '55000';
  end if;
end;
$preflight$;

update public.participants p
   set active_room_user_id = p.user_id
  from public.sessions s
  left join public.health_check_sessions h on h.room_id = s.id
 where p.session_id = s.id
   and p.user_id is not null
   and p.left_at is null
   and s.status = 'active'
   and (s.activity_type = 'estimation' or h.expires_at > clock_timestamp());

create unique index participants_one_active_room_per_user_uidx
  on public.participants(active_room_user_id)
  where active_room_user_id is not null;

drop index if exists public.sessions_one_active_facilitator_activity_uidx;
create unique index sessions_one_active_facilitator_uidx
  on public.sessions(facilitator_user_id)
  where facilitator_user_id is not null and status = 'active';

create function private.maintain_participant_continuity_marker()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if new.left_at is not null then
    new.active_room_user_id := null;
  end if;

  if new.active_room_user_id is not null then
    if new.user_id is distinct from new.active_room_user_id
       or new.left_at is not null
       or not exists (
         select 1
           from public.sessions s
           left join public.health_check_sessions h on h.room_id = s.id
          where s.id = new.session_id
            and s.status = 'active'
            and (s.activity_type = 'estimation' or h.expires_at > clock_timestamp())
       ) then
      raise exception 'invalid_active_room_membership' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

create trigger participants_maintain_continuity_marker
before insert or update of user_id, session_id, left_at, active_room_user_id
on public.participants
for each row execute function private.maintain_participant_continuity_marker();

create function private.clear_completed_session_continuity_markers()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if old.status = 'active' and new.status <> 'active' then
    update public.participants
       set active_room_user_id = null
     where session_id = new.id
       and active_room_user_id is not null;
  end if;
  return new;
end;
$function$;

create trigger sessions_clear_continuity_markers
after update of status on public.sessions
for each row execute function private.clear_completed_session_continuity_markers();

create function private.prepare_active_room_transition(
  p_user_id uuid,
  p_target_session_id uuid,
  p_replace_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_participant public.participants%rowtype;
  v_session public.sessions%rowtype;
  v_health_expires_at timestamptz;
begin
  -- The public caller takes the identity lock before target session row locks.
  -- Row locks below follow the existing session-before-participant order.
  select p.* into v_participant
    from public.participants p
   where p.active_room_user_id = p_user_id;

  if not found then
    return null;
  end if;

  select s.* into strict v_session
    from public.sessions s
   where s.id = v_participant.session_id
   for update;

  select p.* into strict v_participant
    from public.participants p
   where p.id = v_participant.id
   for update;

  if v_session.activity_type = 'health_check' then
    select h.expires_at into v_health_expires_at
      from public.health_check_sessions h
     where h.room_id = v_session.id;

    if v_health_expires_at is null or v_health_expires_at <= clock_timestamp() then
      if v_participant.role = 'facilitator' then
        update public.sessions set status = 'completed' where id = v_session.id;
      else
        update public.participants
           set left_at = clock_timestamp()
         where id = v_participant.id;
      end if;
      return null;
    end if;
  end if;

  if v_session.id = p_target_session_id then
    return null;
  end if;

  if not coalesce(p_replace_active, false) then
    return jsonb_build_object(
      'status', 'active_session_exists',
      'active_session', jsonb_build_object(
        'id', v_session.id,
        'activity_type', v_session.activity_type,
        'role', v_participant.role
      )
    );
  end if;

  if v_participant.role = 'facilitator' then
    if v_session.activity_type = 'health_check' then
      -- This is the same explicit abort semantics as abort_health_check. The
      -- target operation remains in this transaction, so any failure rolls back.
      delete from public.sessions where id = v_session.id;
    else
      update public.sessions set status = 'completed' where id = v_session.id;
    end if;
  else
    -- Keep round_participants and votes as immutable history. In particular,
    -- reestimate_used must survive a later rejoin to this room.
    if v_session.activity_type = 'health_check' then
      -- A frozen, unfinished respondent would otherwise block finalization after
      -- an explicit takeover. Completed aggregate contributions remain intact.
      delete from public.health_check_respondents
       where room_id = v_session.id
         and member_id = v_participant.id
         and state = 'in_progress';
    end if;
    update public.participants
       set left_at = clock_timestamp()
     where id = v_participant.id;
  end if;

  return null;
end;
$function$;

revoke execute on function private.maintain_participant_continuity_marker()
  from public, anon, authenticated, service_role;
revoke execute on function private.clear_completed_session_continuity_markers()
  from public, anon, authenticated, service_role;
revoke execute on function private.prepare_active_room_transition(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

-- Preserve the existing implementations as inaccessible cores and expose new
-- wrappers with an optional explicit takeover input.
drop function public.create_session(uuid, text);
create function public.create_session(
  p_request_id uuid,
  p_facilitator_name text,
  p_replace_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_target_session_id uuid;
  v_conflict jsonb;
  v_result jsonb;
begin
  perform private.require_recent_turnstile();
  -- Room replacement can touch two unrelated sessions. Serialize the small,
  -- explicit transition window before any session row is locked to avoid A↔B
  -- takeover deadlocks.
  perform pg_advisory_xact_lock(20260925, 1);
  if p_request_id is not null and exists (
    select 1 from public.sessions s
     where s.facilitator_user_id = v_user_id
       and s.create_request_id = p_request_id
       and s.activity_type <> 'estimation'
  ) then
    return jsonb_build_object('status', 'request_already_used');
  end if;

  select s.id into v_target_session_id
    from public.sessions s
   where s.facilitator_user_id = v_user_id
     and s.create_request_id = p_request_id
     and s.activity_type = 'estimation'
     and s.status = 'active';

  v_conflict := private.prepare_active_room_transition(
    v_user_id, v_target_session_id, p_replace_active
  );
  if v_conflict is not null then
    return v_conflict;
  end if;

  v_result := private.create_session(p_request_id, p_facilitator_name);
  if v_result->>'status' = 'ok' then
    update public.participants
       set active_room_user_id = v_user_id
     where id = (v_result->'participant'->>'id')::uuid;
  end if;
  if jsonb_typeof(v_result->'participant') = 'object' then
    v_result := jsonb_set(
      v_result,
      '{participant}',
      (v_result->'participant') - 'active_room_user_id' - 'removed_at'
    );
  end if;
  return v_result;
end;
$function$;

drop function public.join_session(text, text);
create function public.join_session(
  p_join_code text,
  p_name text,
  p_replace_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(btrim(p_join_code));
  v_target public.sessions%rowtype;
  v_health_valid boolean;
  v_conflict jsonb;
  v_result jsonb;
begin
  perform private.require_recent_turnstile();
  perform pg_advisory_xact_lock(20260925, 1);
  select s.* into v_target
    from public.sessions s
   where s.join_code = v_code
     and s.status = 'active'
     and s.activity_type in ('estimation', 'health_check')
   for update;
  if not found then
    return jsonb_build_object('status', 'session_not_found');
  end if;

  if v_target.activity_type = 'health_check' then
    select h.phase = 'lobby' and h.expires_at > clock_timestamp()
      into v_health_valid
      from public.health_check_sessions h
     where h.room_id = v_target.id;
    if not coalesce(v_health_valid, false) then
      return jsonb_build_object('status', 'session_not_found');
    end if;
  end if;

  if v_target.facilitator_user_id = v_user_id or exists (
    select 1 from public.participants p
     where p.session_id = v_target.id
       and p.user_id = v_user_id
       and p.role = 'facilitator'
  ) then
    return jsonb_build_object('status', 'role_conflict');
  end if;

  if exists (
    select 1 from public.participants p
     where p.session_id = v_target.id
       and p.user_id = v_user_id
       and p.removed_at is not null
  ) then
    return jsonb_build_object('status', 'membership_removed');
  end if;

  v_conflict := private.prepare_active_room_transition(
    v_user_id, v_target.id, p_replace_active
  );
  if v_conflict is not null then
    return v_conflict;
  end if;

  v_result := private.join_session(p_join_code, p_name);
  if v_result->>'status' = 'ok' then
    update public.participants
       set active_room_user_id = v_user_id
     where id = (v_result->'participant'->>'id')::uuid;
  end if;
  if jsonb_typeof(v_result->'participant') = 'object' then
    v_result := jsonb_set(
      v_result,
      '{participant}',
      (v_result->'participant') - 'active_room_user_id' - 'removed_at'
    );
  end if;
  return v_result;
end;
$function$;

alter function public.create_health_check_room(uuid, uuid, text, text, date, uuid)
  set schema private;

create function public.create_health_check_room(
  p_facilitator_user_id uuid,
  p_request_id uuid,
  p_facilitator_name text,
  p_squad_name text,
  p_measurement_date date,
  p_delivery_id uuid,
  p_replace_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_request_session public.sessions%rowtype;
  v_target_session_id uuid;
  v_request_expires_at timestamptz;
  v_conflict jsonb;
  v_result jsonb;
begin
  if p_facilitator_user_id is null or not exists (
    select 1 from auth.users where id = p_facilitator_user_id
  ) then
    raise exception 'invalid_facilitator' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(20260925, 1);
  select s.* into v_request_session
    from public.sessions s
   where s.facilitator_user_id = p_facilitator_user_id
     and s.create_request_id = p_request_id;

  if found then
    if v_request_session.activity_type <> 'health_check' then
      return jsonb_build_object('status', 'request_already_used');
    end if;

    select h.expires_at into v_request_expires_at
      from public.health_check_sessions h
     where h.room_id = v_request_session.id;
    if v_request_session.status <> 'active'
       or v_request_expires_at is null
       or v_request_expires_at <= clock_timestamp() then
      return jsonb_build_object('status', 'request_already_used');
    end if;
    v_target_session_id := v_request_session.id;
  end if;

  v_conflict := private.prepare_active_room_transition(
    p_facilitator_user_id, v_target_session_id, p_replace_active
  );
  if v_conflict is not null then
    return v_conflict;
  end if;

  v_result := private.create_health_check_room(
    p_facilitator_user_id, p_request_id, p_facilitator_name, p_squad_name,
    p_measurement_date, p_delivery_id
  );
  if v_result->>'status' = 'ok' then
    update public.participants
       set active_room_user_id = p_facilitator_user_id
     where id = (v_result->'participant'->>'id')::uuid;
  end if;
  if jsonb_typeof(v_result->'participant') = 'object' then
    v_result := jsonb_set(
      v_result,
      '{participant}',
      (v_result->'participant') - 'active_room_user_id' - 'removed_at'
    );
  end if;
  return v_result;
end;
$function$;

drop function public.create_health_check_room_prototype(uuid, text, text, date, uuid);
create function public.create_health_check_room_prototype(
  p_request_id uuid,
  p_facilitator_name text,
  p_squad_name text,
  p_measurement_date date,
  p_delivery_id uuid,
  p_replace_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  perform private.require_recent_turnstile();
  return public.create_health_check_room(
    v_user_id, p_request_id, p_facilitator_name, p_squad_name,
    p_measurement_date, p_delivery_id, p_replace_active
  );
end;
$function$;

alter function public.join_health_check_room(uuid, text, text) set schema private;
create function public.join_health_check_room(
  p_user_id uuid,
  p_join_code text,
  p_name text,
  p_replace_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_target_session_id uuid;
  v_conflict jsonb;
  v_result jsonb;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'invalid_user' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(20260925, 1);
  select s.id into v_target_session_id
    from public.sessions s
    join public.health_check_sessions h on h.room_id = s.id
   where s.join_code = upper(btrim(p_join_code))
     and s.status = 'active'
     and s.activity_type = 'health_check'
     and h.phase = 'lobby'
     and h.expires_at > clock_timestamp()
   for update of s;
  if not found then
    return jsonb_build_object('status', 'session_not_found');
  end if;

  if exists (
    select 1 from public.sessions s
     where s.id = v_target_session_id
       and (
         s.facilitator_user_id = p_user_id
         or exists (
           select 1 from public.participants p
            where p.session_id = s.id
              and p.user_id = p_user_id
              and p.role = 'facilitator'
         )
       )
  ) then
    return jsonb_build_object('status', 'role_conflict');
  end if;

  if exists (
    select 1 from public.participants p
     where p.session_id = v_target_session_id
       and p.user_id = p_user_id
       and p.removed_at is not null
  ) then
    return jsonb_build_object('status', 'membership_removed');
  end if;

  v_conflict := private.prepare_active_room_transition(
    p_user_id, v_target_session_id, p_replace_active
  );
  if v_conflict is not null then
    return v_conflict;
  end if;

  v_result := private.join_health_check_room(p_user_id, p_join_code, p_name);
  if v_result->>'status' = 'ok' then
    update public.participants
       set active_room_user_id = p_user_id
     where id = (v_result->'participant'->>'id')::uuid;
  end if;
  if jsonb_typeof(v_result->'participant') = 'object' then
    v_result := jsonb_set(
      v_result,
      '{participant}',
      (v_result->'participant') - 'active_room_user_id' - 'removed_at'
    );
  end if;
  return v_result;
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
   where session_id = p_session_id
     and user_id = v_user_id
     and left_at is null;

  update public.participants
     set left_at = clock_timestamp()
   where id = v_participant.id;

  -- Never delete current-round history here. Rejoin/claim uses ON CONFLICT and
  -- therefore preserves reestimate_used as well as any historical vote.
  return jsonb_build_object('status', 'ok');
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
     and p.removed_at is null
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
    'participant', to_jsonb(v_participant)
      - 'user_id' - 'active_room_user_id' - 'removed_at',
    'vote', to_jsonb(v_vote),
    'round_participant', to_jsonb(v_round_participant)
  );
end;
$function$;

create function public.deactivate_estimation_participant(
  p_session_id uuid,
  p_participant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
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
     and s.facilitator_user_id = v_user_id
   for update of s;
  if not found then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'estimation' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  if v_session.status <> 'active' then
    raise exception 'session_not_active' using errcode = '22023';
  end if;

  select * into v_participant
    from public.participants p
   where p.session_id = p_session_id
     and p.id = p_participant_id
     and p.role = 'participant'
   for update;
  if not found then
    return jsonb_build_object('status', 'participant_not_found');
  end if;
  if v_participant.removed_at is not null then
    return jsonb_build_object('status', 'already_inactive');
  end if;

  update public.participants
     set left_at = coalesce(left_at, clock_timestamp()), removed_at = clock_timestamp()
   where id = p_participant_id;

  return jsonb_build_object('status', 'deactivated');
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
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  select s.* into v_session
    from public.sessions s
   where s.id = p_room_id and s.facilitator_user_id = v_user_id
     and exists (
       select 1 from public.participants p where p.session_id = s.id
        and p.user_id = v_user_id and p.left_at is null and p.role = 'facilitator'
     )
   for update;
  if not found then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'health_check' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  select * into strict v_health from public.health_check_sessions where room_id = p_room_id;
  if v_health.expires_at <= clock_timestamp() then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_health.phase = 'download_pending' then
    raise exception 'health_check_removal_locked' using errcode = '22023';
  end if;
  if v_health.phase = 'collecting' then
    select state into v_state from public.health_check_respondents
     where room_id = p_room_id and member_id = p_member_id;
    if not found then raise exception 'respondent_not_found' using errcode = '22023'; end if;
    if v_state = 'completed' then raise exception 'completed_respondent_locked' using errcode = '22023'; end if;
    delete from public.health_check_respondents
     where room_id = p_room_id and member_id = p_member_id and state = 'in_progress';
  end if;
  update public.participants
     set left_at = coalesce(left_at, statement_timestamp()),
         removed_at = statement_timestamp()
   where session_id = p_room_id and id = p_member_id
     and role = 'participant' and removed_at is null;
  if not found then raise exception 'respondent_not_found' using errcode = '22023'; end if;
  return jsonb_build_object('status', 'removed');
end;
$function$;

-- Removed members and voluntary leavers remain historical round members but do
-- not count toward current-round completion or appear in pending-vote status.
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
     and p.role = 'participant'
     and p.left_at is null;

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
     and p.role = 'participant' and p.left_at is null
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
    from public.health_check_sessions
   where room_id = v_session.id;
  select * into strict v_participant
    from public.participants
   where session_id = v_session.id
     and user_id = v_user_id
     and role = 'facilitator'
     and left_at is null;

  if v_participant.active_room_user_id is null then
    if exists (
      select 1 from public.participants p
       where p.active_room_user_id = v_user_id
         and p.id <> v_participant.id
    ) then
      return jsonb_build_object('status', 'active_session_exists');
    end if;
    update public.participants
       set active_room_user_id = v_user_id
     where id = v_participant.id;
  end if;

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
    'participant', to_jsonb(v_participant)
      - 'user_id' - 'active_room_user_id' - 'removed_at'
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
     and p.role = 'participant' and p.left_at is null
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
  select s.* into v_session
    from public.sessions s
   where s.id = p_room_id
     and exists (select 1 from public.health_check_sessions h where h.room_id = s.id and h.expires_at > clock_timestamp())
     and exists (select 1 from public.participants p where p.session_id = s.id and p.user_id = v_user_id and p.left_at is null and p.removed_at is null);
  if not found then raise exception 'membership_required' using errcode = '42501'; end if;
  if v_session.activity_type <> 'health_check' then raise exception 'wrong_activity_type' using errcode = '22023'; end if;
  select p.* into strict v_participant
    from public.participants p
   where p.session_id = p_room_id and p.user_id = v_user_id and p.left_at is null and p.removed_at is null;
  select jsonb_build_object(
    'phase', h.phase,
    'template_version', h.template_version,
    'squad_name', h.squad_name,
    'measurement_date', h.measurement_date,
    'respondent_state', r.state,
    'role', p.role,
    'expires_at', h.expires_at
  ) into v_result
    from public.sessions s
    join public.health_check_sessions h on h.room_id = s.id
    join public.participants p on p.id = v_participant.id and p.session_id = s.id
    left join public.health_check_respondents r on r.room_id = s.id and r.member_id = p.id
   where s.id = p_room_id;
  return v_result;
end;
$function$;

revoke execute on function private.create_health_check_room(uuid, uuid, text, text, date, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.join_health_check_room(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.create_session(uuid, text, boolean)
  from public, anon, service_role;
revoke execute on function public.join_session(text, text, boolean)
  from public, anon, service_role;
revoke execute on function public.create_health_check_room(uuid, uuid, text, text, date, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.create_health_check_room_prototype(uuid, text, text, date, uuid, boolean)
  from public, anon, service_role;
revoke execute on function public.join_health_check_room(uuid, text, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.deactivate_estimation_participant(uuid, uuid)
  from public, anon, service_role;

grant execute on function public.create_session(uuid, text, boolean) to authenticated;
grant execute on function public.join_session(text, text, boolean) to authenticated;
grant execute on function public.create_health_check_room(uuid, uuid, text, text, date, uuid, boolean)
  to service_role;
grant execute on function public.create_health_check_room_prototype(uuid, text, text, date, uuid, boolean)
  to authenticated;
grant execute on function public.join_health_check_room(uuid, text, text, boolean)
  to service_role;
grant execute on function public.deactivate_estimation_participant(uuid, uuid)
  to authenticated;

commit;
