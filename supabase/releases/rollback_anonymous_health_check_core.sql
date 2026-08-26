-- Controlled rollback for anonymous_health_check_core.
-- Stop application traffic before running. This rollback intentionally aborts
-- while any live health data or report job exists; remove it only through an
-- approved maintenance procedure first.
-- After this SQL succeeds, repair only this migration-history entry:
--   supabase migration repair 20260826083155 --status reverted --linked
-- private schema USAGE is lockdown-release-owned; this rollback neither revokes
-- nor otherwise changes service_role's schema privilege or ownership metadata.
begin;

set local lock_timeout = '30s';
set local statement_timeout = '5min';

do $monitoring_dependency$
begin
  if to_regprocedure('private.run_health_check_cleanup_with_heartbeat()') is not null
     or to_regclass('private.retention_job_heartbeats') is not null then
    raise exception 'Rollback aborted: run rollback_health_check_cleanup_monitoring.sql and remove its owned monitoring objects first';
  end if;
end;
$monitoring_dependency$;

lock table public.health_check_report_jobs in access exclusive mode;
lock table public.sessions in access exclusive mode;

do $preflight$
begin
  if exists (
    select 1 from public.health_check_report_jobs where status in ('processing', 'ready')
  ) then
    raise exception 'Rollback aborted: processing or ready health report jobs exist';
  end if;
  if exists (select 1 from public.health_check_report_jobs) then
    raise exception 'Rollback aborted: health report jobs exist';
  end if;
  if exists (select 1 from public.health_check_sessions)
     or exists (select 1 from public.sessions where activity_type = 'health_check') then
    raise exception 'Rollback aborted: health-check rooms exist';
  end if;
end;
$preflight$;

do $unschedule$
declare
  v_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    select jobid into v_job_id from cron.job
     where jobname = 'cleanup-expired-health-checks';
    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
  end if;
end;
$unschedule$;

drop function public.finalize_health_check(uuid);
drop function public.finalize_health_check_prototype(uuid);
drop function public.get_health_check_download_status(uuid);
drop function public.get_health_check_download_package_for_service(uuid, uuid);
drop function public.get_health_check_report_snapshot_for_service(uuid, text);
drop function private.claim_health_check_report_job(uuid, text, interval);
drop function private.fail_health_check_report_job(uuid, text);
drop function private.materialize_health_check_download(uuid, text, bytea, bytea, integer, text);
drop function private.get_health_check_download_package(uuid, uuid);
drop function public.abort_health_check(uuid);
drop function public.remove_health_check_respondent(uuid, uuid);
drop function public.get_health_check_progress(uuid);
drop function public.submit_health_check(uuid, smallint[]);
drop function public.start_health_check(uuid);
drop function public.get_health_check_state(uuid);
drop function public.join_health_check_room(uuid, text, text);
drop function public.create_health_check_room(uuid, uuid, text, text, date, uuid);

-- Restore the common membership RPC definitions from
-- 20260825140936_estimation_activity_type_foundation.sql.
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

  select * into v_session
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
    select * into v_round_participant
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
   where p.session_id = p_session_id
     and p.user_id = v_user_id
     and p.left_at is null;
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
    'status', case when v_session.status = 'completed' then 'session_completed' else 'ok' end,
    'session', to_jsonb(v_session) - 'facilitator_user_id' - 'create_request_id',
    'participant', to_jsonb(v_participant) - 'user_id',
    'vote', to_jsonb(v_vote),
    'round_participant', to_jsonb(v_round_participant)
  );
end;
$function$;

create or replace function private.is_session_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select auth.uid() is not null
    and exists (
      select 1 from public.participants p
       where p.session_id = p_session_id
         and p.user_id = auth.uid()
         and p.left_at is null
    );
$function$;

create or replace function private.can_access_presence_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select auth.uid() is not null
    and exists (
      select 1 from public.participants p
       where p.user_id = auth.uid()
         and p.left_at is null
         and (
           p_topic = 'session:' || p.session_id::text
           or p_topic like 'session:' || p.session_id::text || ':%'
         )
    );
$function$;

revoke execute on function public.join_session(text, text) from public, anon;
revoke execute on function public.leave_session(uuid) from public, anon;
revoke execute on function public.restore_session(uuid) from public, anon;
grant execute on function public.join_session(text, text) to authenticated;
grant execute on function public.leave_session(uuid) to authenticated;
grant execute on function public.restore_session(uuid) to authenticated;

drop trigger sessions_preserve_health_check_room_type on public.sessions;

drop table public.health_check_report_jobs;
drop table public.health_check_question_aggregates;
drop table public.health_check_respondents;
drop table public.health_check_sessions;
drop table public.health_check_questions;
drop table public.health_check_areas;
drop table public.health_check_templates;

drop function private.cleanup_expired_health_checks();
drop function private.validate_health_report_job_state();
drop function private.prevent_health_check_room_type_change();
drop function private.validate_health_check_room_type();
drop function private.validate_health_check_expiry();
drop function private.prevent_health_catalog_mutation();

do $verify$
begin
  if to_regclass('public.health_check_sessions') is not null
     or to_regclass('public.health_check_report_jobs') is not null then
    raise exception 'Rollback verification failed: health-check tables remain';
  end if;
  if not exists (
    select 1 from pg_proc
     where oid = 'public.join_session(text,text)'::regprocedure
       and prosecdef and proconfig @> array['search_path=pg_catalog']
  ) or not exists (
    select 1 from pg_proc
     where oid = 'public.leave_session(uuid)'::regprocedure
       and prosecdef and proconfig @> array['search_path=pg_catalog']
  ) or not exists (
    select 1 from pg_proc
     where oid = 'public.restore_session(uuid)'::regprocedure
       and prosecdef and proconfig @> array['search_path=pg_catalog']
  ) then
    raise exception 'Rollback verification failed: common RPCs were not restored';
  end if;
  if pg_get_functiondef('public.restore_session(uuid)'::regprocedure)
       like '%health_check_sessions%' then
    raise exception 'Rollback verification failed: restore_session still references health core';
  end if;
end;
$verify$;

commit;
