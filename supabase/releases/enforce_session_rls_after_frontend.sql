-- Lockdown rollout. Additive migration and RPC frontend already removed direct
-- writes; this release completes member-scoped SELECT RLS and private presence.

begin;

set local lock_timeout = '30s';
set local statement_timeout = '5min';

do $preflight$
begin
  if to_regclass('public.health_check_sessions') is not null
     or to_regclass('public.health_check_report_jobs') is not null
     or to_regprocedure('private.cleanup_expired_health_checks()') is not null then
    raise exception 'session_rls_lockdown_must_precede_health_core'
      using errcode = '55000';
  end if;
end;
$preflight$;

drop policy if exists "Alle kan lese sessions" on public.sessions;
drop policy if exists "Alle kan opprette sessions" on public.sessions;
drop policy if exists "Alle kan oppdatere sessions" on public.sessions;

drop policy if exists "Alle kan lese participants" on public.participants;
drop policy if exists "Alle kan registrere seg som participant" on public.participants;
drop policy if exists "Kan oppdatere egen participant" on public.participants;
drop policy if exists "Kan slette participants" on public.participants;

drop policy if exists "Alle kan lese votes" on public.votes;
drop policy if exists "Alle kan stemme" on public.votes;
drop policy if exists "Kan slette egne votes" on public.votes;

create schema if not exists private;
revoke all on schema private from public, anon;

create table if not exists private.private_schema_privilege_state (
  release_name text primary key,
  authenticated_had_usage boolean not null,
  service_role_had_usage boolean not null
);
revoke all on table private.private_schema_privilege_state
  from public, anon, authenticated, service_role;
insert into private.private_schema_privilege_state (
  release_name, authenticated_had_usage, service_role_had_usage
) values (
  'enforce_session_rls_after_frontend',
  has_schema_privilege('authenticated', 'private', 'USAGE'),
  has_schema_privilege('service_role', 'private', 'USAGE')
)
on conflict (release_name) do nothing;

grant usage on schema private to authenticated, service_role;

create or replace function private.is_session_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select auth.uid() is not null
    and exists (
      select 1
        from public.participants p
       where p.session_id = p_session_id
         and p.user_id = auth.uid()
         and p.left_at is null
    );
$function$;

create or replace function private.can_read_vote(
  p_session_id uuid,
  p_participant_id uuid,
  p_round integer
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select auth.uid() is not null
    and exists (
      select 1
        from public.sessions s
       where s.id = p_session_id
         and exists (
           select 1
             from public.participants member
             where member.session_id = s.id
               and member.user_id = auth.uid()
               and member.left_at is null
         )
         and (
           p_round < s.current_round
           or (p_round = s.current_round and s.votes_revealed)
            or exists (
             select 1
               from public.participants owner
              where owner.id = p_participant_id
                and owner.session_id = s.id
                and owner.user_id = auth.uid()
           )
         )
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
      select 1
        from public.participants p
       where p.user_id = auth.uid()
         and p.left_at is null
         and (
           p_topic = 'session:' || p.session_id::text
           or p_topic like 'session:' || p.session_id::text || ':%'
         )
    );
$function$;

revoke execute on function private.is_session_member(uuid) from public, anon, authenticated;
revoke execute on function private.can_read_vote(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function private.can_access_presence_topic(text) from public, anon, authenticated;
grant execute on function private.is_session_member(uuid) to authenticated;
grant execute on function private.can_read_vote(uuid, uuid, integer) to authenticated;
grant execute on function private.can_access_presence_topic(text) to authenticated;

create policy "Members can read their sessions"
  on public.sessions
  for select
  to authenticated
  using ((select private.is_session_member(id)));

create policy "Members can read session participants"
  on public.participants
  for select
  to authenticated
  using ((select private.is_session_member(session_id)));

create policy "Authorized members can read votes"
  on public.votes
  for select
  to authenticated
  using ((select private.can_read_vote(session_id, participant_id, round)));

create policy "Members can read round participation"
  on public.round_participants
  for select
  to authenticated
  using ((select private.is_session_member(session_id)));

revoke all on table public.sessions from anon, authenticated;
revoke all on table public.participants from anon, authenticated;
revoke all on table public.votes from anon, authenticated;
revoke all on table public.round_participants from anon, authenticated;

grant select (id, activity_type, consensus_streak, created_at, current_round, join_code, started, status, votes_revealed)
  on table public.sessions to authenticated;
grant select (id, joined_at, left_at, name, role, session_id)
  on table public.participants to authenticated;
grant select on table public.votes to authenticated;
grant select on table public.round_participants to authenticated;

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
revoke execute on function public.get_round_vote_statuses(uuid, integer) from public, anon;
grant execute on function public.get_round_vote_statuses(uuid, integer) to authenticated;

-- The Realtime schema is platform-owned and locked. Policies on messages are
-- supported. Disable Realtime Settings > "Allow public access" before rollout.
drop policy if exists "Session members can read presence" on realtime.messages;
drop policy if exists "Session members can publish presence" on realtime.messages;

create policy "Session members can read presence"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension in ('presence', 'broadcast')
    and (select private.can_access_presence_topic((select realtime.topic())))
  );

create policy "Session members can publish presence"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and (select private.can_access_presence_topic((select realtime.topic())))
  );

commit;
