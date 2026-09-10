-- Align the persisted consensus streak with the frontend discussion rule:
-- equal sizes still count as consensus unless value spans from bronze to gold.
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
    return jsonb_build_object(
      'status', 'already_revealed',
      'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id'
    );
  end if;

  select count(*)
    into v_eligible_count
    from public.round_participants rp
    join public.participants p on p.id = rp.participant_id and p.session_id = rp.session_id
   where rp.session_id = p_session_id
     and rp.round = v_session.current_round
     and p.role = 'participant';

  select
    count(*),
    count(distinct v.size),
    min(case v.value when 'bronze' then 0 when 'silver' then 1 when 'gold' then 2 end),
    max(case v.value when 'bronze' then 0 when 'silver' then 1 when 'gold' then 2 end)
    into v_vote_count, v_distinct_sizes, v_min_value_score, v_max_value_score
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
    and v_distinct_sizes = 1
    and v_max_value_score - v_min_value_score < 2;

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

revoke execute on function public.reveal_votes(uuid) from public, anon;
grant execute on function public.reveal_votes(uuid) to authenticated;
