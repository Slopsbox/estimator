-- Expand room sessions with an explicit activity discriminator. Existing rows
-- and the estimation creator stay on the legacy estimation behavior.
alter table public.sessions
  add column activity_type text not null default 'estimation';

alter table public.sessions
  add constraint sessions_activity_type_valid
  check (activity_type in ('estimation', 'health_check')) not valid;

alter table public.sessions validate constraint sessions_activity_type_valid;

comment on column public.sessions.activity_type is
  'Room activity contract: estimation or health_check.';

grant select (activity_type) on table public.sessions to authenticated;

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

  select *
    into v_session
    from public.sessions
   where facilitator_user_id = v_user_id
     and status = 'active'
   order by (create_request_id = p_request_id) desc, created_at desc
   limit 1;

  if found then
    if v_session.activity_type <> 'estimation' then
      raise exception 'wrong_activity_type' using errcode = '22023';
    end if;

    select *
      into strict v_participant
      from public.participants
     where session_id = v_session.id
       and user_id = v_user_id;

    select *
      into v_round_participant
      from public.round_participants
     where session_id = v_session.id
       and round = v_session.current_round
       and participant_id = v_participant.id;

    return jsonb_build_object(
      'status', case when v_session.create_request_id = p_request_id then 'ok' else 'active_session_exists' end,
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
        status,
        current_round,
        join_code,
        votes_revealed,
        started,
        consensus_streak,
        facilitator_user_id,
        create_request_id,
        activity_type
      ) values (
        'active',
        1,
        v_join_code,
        false,
        false,
        0,
        v_user_id,
        p_request_id,
        'estimation'
      )
      returning * into v_session;
      exit;
    exception
      when unique_violation then
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

create or replace function public.join_session(
  p_join_code text,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_code text := upper(btrim(p_join_code));
  v_name text := btrim(p_name);
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
  v_round_participant public.round_participants%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_code is null or char_length(v_code) <> 4 then
    return jsonb_build_object('status', 'session_not_found');
  end if;

  select *
    into v_session
    from public.sessions
   where join_code = v_code
     and status = 'active'
     and facilitator_user_id is distinct from v_user_id
     and not exists (
       select 1 from public.participants p
        where p.session_id = public.sessions.id
          and p.user_id = v_user_id
          and p.role = 'facilitator'
     )
   for update;

  if not found then
    if exists (
      select 1 from public.sessions s
       where s.join_code = v_code
         and s.status = 'active'
         and (
           s.facilitator_user_id = v_user_id
           or exists (
             select 1 from public.participants p
              where p.session_id = s.id
                and p.user_id = v_user_id
                and p.role = 'facilitator'
           )
         )
    ) then
      return jsonb_build_object('status', 'role_conflict');
    end if;
    return jsonb_build_object('status', 'session_not_found');
  end if;

  insert into public.participants (session_id, name, role, user_id, left_at)
  values (v_session.id, v_name, 'participant', v_user_id, null)
  on conflict (session_id, user_id) where user_id is not null
  do update set name = excluded.name, left_at = null
  returning * into v_participant;

  if v_session.activity_type = 'estimation'
     and v_session.started and not v_session.votes_revealed then
    insert into public.round_participants (session_id, round, participant_id)
    values (v_session.id, v_session.current_round, v_participant.id)
    on conflict do nothing;
  end if;

  if v_session.activity_type = 'estimation' then
    select *
      into v_round_participant
      from public.round_participants
     where session_id = v_session.id
       and round = v_session.current_round
       and participant_id = v_participant.id;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id',
    'participant', to_jsonb(v_participant) - 'user_id',
    'round_participant', to_jsonb(v_round_participant)
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

  select p.*
    into v_participant
    from public.participants p
   where p.session_id = p_session_id
     and p.user_id = v_user_id
     and p.left_at is null;

  if not found then
    return jsonb_build_object('status', 'membership_missing');
  end if;

  select *
    into strict v_session
    from public.sessions
   where id = p_session_id;

  if v_session.activity_type = 'estimation' then
    select *
      into v_vote
      from public.votes
     where session_id = p_session_id
       and round = v_session.current_round
       and participant_id = v_participant.id;

    select *
      into v_round_participant
      from public.round_participants
     where session_id = p_session_id
       and round = v_session.current_round
       and participant_id = v_participant.id;
  end if;

  return jsonb_build_object(
    'status', case when v_session.status = 'completed' then 'session_completed' else 'ok' end,
    'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id',
    'participant', to_jsonb(v_participant) - 'user_id',
    'vote', to_jsonb(v_vote),
    'round_participant', to_jsonb(v_round_participant)
  );
end;
$function$;

create or replace function public.claim_round(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_participant public.participants%rowtype;
  v_round_participant public.round_participants%rowtype;
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
          and p.role = 'participant'
     )
   for update;

  if not found then
    raise exception 'session_not_available' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'estimation' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  if v_session.status <> 'active' or not v_session.started or v_session.votes_revealed then
    raise exception 'round_not_claimable';
  end if;

  select * into strict v_participant
    from public.participants
   where session_id = p_session_id
     and user_id = v_user_id
     and left_at is null;

  insert into public.round_participants (session_id, round, participant_id)
  values (p_session_id, v_session.current_round, v_participant.id)
  on conflict do nothing;

  select * into strict v_round_participant
    from public.round_participants
   where session_id = p_session_id
     and round = v_session.current_round
     and participant_id = v_participant.id;

  return jsonb_build_object(
    'status', 'ok',
    'round_participant', to_jsonb(v_round_participant)
  );
end;
$function$;

create or replace function public.cast_vote(
  p_session_id uuid,
  p_round integer,
  p_size text,
  p_value text
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
  v_vote public.votes%rowtype;
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
          and p.role = 'participant'
     )
   for update;

  if not found then
    raise exception 'session_not_available' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'estimation' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  if p_size is null or p_size not in ('xs', 's', 'm', 'l', 'xl') then
    raise exception 'invalid_size' using errcode = '22023';
  end if;
  if p_value is null or p_value not in ('gold', 'silver', 'bronze') then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  if v_session.status <> 'active' or not v_session.started or v_session.votes_revealed then
    raise exception 'voting_closed';
  end if;
  if p_round is null or p_round <> v_session.current_round then
    raise exception 'wrong_round' using errcode = '22023';
  end if;

  select * into strict v_participant
    from public.participants
   where session_id = p_session_id
     and user_id = v_user_id
     and left_at is null
     and role = 'participant';

  if not exists (
    select 1
      from public.round_participants
     where session_id = p_session_id
       and round = p_round
       and participant_id = v_participant.id
  ) then
    raise exception 'round_membership_required' using errcode = '42501';
  end if;

  insert into public.votes (session_id, participant_id, round, size, value)
  values (p_session_id, v_participant.id, p_round, p_size, p_value)
  on conflict (participant_id, round) do nothing
  returning * into v_vote;

  if not found then
    select * into strict v_vote
      from public.votes
     where participant_id = v_participant.id
       and round = p_round;

    return jsonb_build_object('status', 'duplicate', 'vote', to_jsonb(v_vote));
  end if;

  return jsonb_build_object('status', 'ok', 'vote', to_jsonb(v_vote));
end;
$function$;

create or replace function public.retract_vote(
  p_session_id uuid,
  p_round integer
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
  v_updated integer;
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
          and p.role = 'participant'
     )
   for update;

  if not found then
    raise exception 'session_not_available' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'estimation' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  if v_session.status <> 'active' or not v_session.started or v_session.votes_revealed then
    raise exception 'retraction_closed';
  end if;
  if p_round is null or p_round <> v_session.current_round then
    raise exception 'wrong_round' using errcode = '22023';
  end if;

  select * into strict v_participant
    from public.participants
   where session_id = p_session_id
     and user_id = v_user_id
     and left_at is null
     and role = 'participant';

  update public.round_participants
     set reestimate_used = true
   where session_id = p_session_id
     and round = p_round
     and participant_id = v_participant.id
     and not reestimate_used
     and exists (
       select 1
         from public.votes v
        where v.session_id = p_session_id
          and v.round = p_round
          and v.participant_id = v_participant.id
     );

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'reestimate_unavailable';
  end if;

  delete from public.votes
   where session_id = p_session_id
     and round = p_round
     and participant_id = v_participant.id;

  return jsonb_build_object('status', 'ok');
end;
$function$;

create or replace function public.start_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
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
        where session_id = p_session_id
          and user_id = v_user_id
          and left_at is null
          and role = 'facilitator'
     )
   for update;

  if not found then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'estimation' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;
  if v_session.status <> 'active' then
    raise exception 'session_not_active';
  end if;

  update public.sessions
     set started = true
   where id = p_session_id
  returning * into v_session;

  insert into public.round_participants (session_id, round, participant_id)
  select p_session_id, v_session.current_round, p.id
    from public.participants p
   where p.session_id = p_session_id
     and p.left_at is null
  on conflict do nothing;

  return jsonb_build_object('status', 'ok', 'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id');
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
        where session_id = p_session_id
          and user_id = v_user_id
          and left_at is null
          and role = 'facilitator'
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
    return jsonb_build_object('status', 'already_revealed', 'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id');
  end if;

  select count(*)
    into v_eligible_count
    from public.round_participants rp
    join public.participants p on p.id = rp.participant_id and p.session_id = rp.session_id
   where rp.session_id = p_session_id
     and rp.round = v_session.current_round
     and p.role = 'participant';

  select count(*), count(distinct v.size)
    into v_vote_count, v_distinct_sizes
    from public.votes v
    join public.round_participants rp
      on rp.session_id = v.session_id
     and rp.round = v.round
     and rp.participant_id = v.participant_id
    join public.participants p
      on p.session_id = rp.session_id
     and p.id = rp.participant_id
     and p.role = 'participant'
   where v.session_id = p_session_id
     and v.round = v_session.current_round;

  v_consensus := v_eligible_count > 0
    and v_vote_count = v_eligible_count
    and v_distinct_sizes = 1;

  update public.sessions
     set votes_revealed = true,
         consensus_streak = case when v_consensus then consensus_streak + 1 else 0 end
   where id = p_session_id
  returning * into v_session;

  return jsonb_build_object(
    'status', 'ok',
    'consensus', v_consensus,
    'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id'
  );
end;
$function$;

create or replace function public.next_round(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
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
        where session_id = p_session_id
          and user_id = v_user_id
          and left_at is null
          and role = 'facilitator'
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
  if not v_session.votes_revealed then
    raise exception 'current_round_not_revealed';
  end if;

  update public.sessions
     set current_round = current_round + 1,
         votes_revealed = false
   where id = p_session_id
  returning * into v_session;

  insert into public.round_participants (session_id, round, participant_id)
  select p_session_id, v_session.current_round, p.id
    from public.participants p
   where p.session_id = p_session_id
     and p.left_at is null
  on conflict do nothing;

  return jsonb_build_object('status', 'ok', 'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id');
end;
$function$;

create or replace function public.end_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.sessions%rowtype;
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
        where session_id = p_session_id
          and user_id = v_user_id
          and left_at is null
          and role = 'facilitator'
     )
   for update;

  if not found then
    raise exception 'facilitator_required' using errcode = '42501';
  end if;
  if v_session.activity_type <> 'estimation' then
    raise exception 'wrong_activity_type' using errcode = '22023';
  end if;

  update public.sessions
     set status = 'completed'
   where id = p_session_id
  returning * into v_session;

  return jsonb_build_object('status', 'ok', 'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id');
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

  select * into strict v_participant
    from public.participants
   where session_id = p_session_id
     and user_id = v_user_id
     and left_at is null;

  update public.participants
     set left_at = now()
   where id = v_participant.id;

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
       where v.session_id = rp.session_id
         and v.round = rp.round
         and v.participant_id = rp.participant_id
    )
  ) order by rp.joined_at), '[]'::jsonb)
    into v_result
    from public.round_participants rp
    join public.participants p
      on p.session_id = rp.session_id
     and p.id = rp.participant_id
     and p.role = 'participant'
   where rp.session_id = p_session_id
     and rp.round = p_round;

  return v_result;
end;
$function$;

revoke execute on function public.create_session(uuid, text) from public, anon;
revoke execute on function public.join_session(text, text) from public, anon;
revoke execute on function public.restore_session(uuid) from public, anon;
revoke execute on function public.claim_round(uuid) from public, anon;
revoke execute on function public.cast_vote(uuid, integer, text, text) from public, anon;
revoke execute on function public.retract_vote(uuid, integer) from public, anon;
revoke execute on function public.start_session(uuid) from public, anon;
revoke execute on function public.reveal_votes(uuid) from public, anon;
revoke execute on function public.next_round(uuid) from public, anon;
revoke execute on function public.end_session(uuid) from public, anon;
revoke execute on function public.leave_session(uuid) from public, anon;
revoke execute on function public.get_round_vote_statuses(uuid, integer) from public, anon;

grant execute on function public.create_session(uuid, text) to authenticated;
grant execute on function public.join_session(text, text) to authenticated;
grant execute on function public.restore_session(uuid) to authenticated;
grant execute on function public.claim_round(uuid) to authenticated;
grant execute on function public.cast_vote(uuid, integer, text, text) to authenticated;
grant execute on function public.retract_vote(uuid, integer) to authenticated;
grant execute on function public.start_session(uuid) to authenticated;
grant execute on function public.reveal_votes(uuid) to authenticated;
grant execute on function public.next_round(uuid) to authenticated;
grant execute on function public.end_session(uuid) to authenticated;
grant execute on function public.leave_session(uuid) to authenticated;
grant execute on function public.get_round_vote_statuses(uuid, integer) to authenticated;
