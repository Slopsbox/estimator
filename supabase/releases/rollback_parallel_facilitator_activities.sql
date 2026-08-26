-- Controlled rollback for allow_parallel_facilitator_activities.
-- Stop create traffic before running.
begin;

lock table public.sessions in access exclusive mode;

do $preflight$
begin
  if exists (
    select facilitator_user_id
      from public.sessions
     where facilitator_user_id is not null
       and status = 'active'
     group by facilitator_user_id
    having count(*) > 1
  ) then
    raise exception 'Rollback aborted: a facilitator owns more than one active activity';
  end if;
end;
$preflight$;

drop index if exists public.sessions_one_active_facilitator_activity_uidx;

create unique index sessions_one_active_facilitator_uidx
  on public.sessions(facilitator_user_id)
  where facilitator_user_id is not null and status = 'active';

create or replace function public.create_health_check_room(
  p_facilitator_user_id uuid,
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
declare
  v_name text := btrim(p_facilitator_name);
  v_squad_name text := btrim(p_squad_name);
  v_session public.sessions%rowtype;
  v_health public.health_check_sessions%rowtype;
  v_participant public.participants%rowtype;
  v_join_code text;
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_attempt integer;
  v_constraint_name text;
begin
  if p_facilitator_user_id is null or not exists (
    select 1 from auth.users where id = p_facilitator_user_id
  ) then
    raise exception 'invalid_facilitator' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_facilitator_user_id::text, 0));

  select * into v_session
    from public.sessions
   where facilitator_user_id = p_facilitator_user_id
     and create_request_id = p_request_id
   limit 1;

  if found then
    if v_session.activity_type <> 'health_check' then
      return jsonb_build_object('status', 'active_session_exists');
    end if;

    select * into strict v_health
      from public.health_check_sessions where room_id = v_session.id;
    if v_session.status <> 'active' or v_health.expires_at <= clock_timestamp() then
      return jsonb_build_object('status', 'request_already_used');
    end if;
    select * into strict v_participant
      from public.participants
     where session_id = v_session.id
       and user_id = p_facilitator_user_id
       and role = 'facilitator';

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
  end if;

  select * into v_session
    from public.sessions
   where facilitator_user_id = p_facilitator_user_id
     and status = 'active'
   order by created_at desc
   limit 1;
  if found then
    return jsonb_build_object('status', 'active_session_exists');
  end if;

  if p_request_id is null then
    raise exception 'request_id_required' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_squad_name is null or char_length(v_squad_name) not between 1 and 80
     or v_squad_name ~ '[[:cntrl:]]' then
    raise exception 'invalid_squad_name' using errcode = '22023';
  end if;
  if p_measurement_date is null then
    raise exception 'measurement_date_required' using errcode = '22023';
  end if;
  if p_delivery_id is null then
    raise exception 'delivery_id_required' using errcode = '22023';
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
        p_facilitator_user_id, p_request_id, 'health_check'
      ) returning * into v_session;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name <> 'sessions_join_code_key' then
        raise;
      end if;
      if v_attempt = 32 then
        raise exception 'join_code_generation_exhausted';
      end if;
    end;
  end loop;

  insert into public.participants (session_id, name, role, user_id)
  values (v_session.id, v_name, 'facilitator', p_facilitator_user_id)
  returning * into v_participant;

  insert into public.health_check_sessions (
    room_id, delivery_id, template_version, squad_name, measurement_date, expires_at
  ) values (
    v_session.id, p_delivery_id, 'squad-health-v1', v_squad_name,
    p_measurement_date, clock_timestamp() + interval '23 hours 55 minutes'
  ) returning * into v_health;

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

revoke execute on function public.create_health_check_room(uuid, uuid, text, text, date, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.create_health_check_room(uuid, uuid, text, text, date, uuid)
  to service_role;

commit;
