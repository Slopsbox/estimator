-- MANUAL ROLLBACK STEPS (not performed by this SQL file):
-- 1. If estimation_activity_type_foundation is applied, first run
--    rollback_activity_type_foundation.sql and verify it committed successfully.
-- 2. Run this file in a maintenance window with application traffic stopped.
--    The script takes ACCESS EXCLUSIVE locks and aborts rather than deleting or
--    overwriting rows created or changed after the cutover.
-- 3. After this transaction succeeds, enable Realtime Settings >
--    "Allow public access" in the Supabase Dashboard for the legacy frontend.
--    Dashboard Realtime settings cannot be changed safely from SQL.
-- 4. Redeploy the legacy Vercel deployment fd5c462 before reopening traffic.
-- 5. If migration 20260825111134 is registered as applied, mark only its
--    migration-history entry reverted after this SQL succeeds (do not re-run
--    this command blindly):
--      supabase migration repair 20260825111134 --status reverted --linked
--
-- REQUIRED BACKUP CONTRACT:
-- The pre-cutover backup schema rollback_20260825_session_integrity must contain
-- sessions, participants and votes snapshots made before the additive migration.
-- The snapshots must contain every row and all legacy columns in those tables.
-- This rollback intentionally does not touch auth.users.

begin;

set local lock_timeout = '30s';
set local statement_timeout = '5min';

-- Freeze the legacy tables before checking for post-cutover writes. Run this
-- only after traffic is stopped; otherwise the lock timeout aborts the rollback.
lock table public.sessions, public.participants, public.votes
  in access exclusive mode;

-- Safety/preflight: validate the backup contract before changing any object.
do $preflight$
declare
  v_table text;
  v_column text;
  v_missing_columns text;
  v_count bigint;
  v_new_sessions bigint;
  v_new_participants bigint;
  v_new_votes bigint;
begin
  if to_regnamespace('rollback_20260825_session_integrity') is null then
    raise exception
      'Rollback aborted: backup schema rollback_20260825_session_integrity is missing';
  end if;

  foreach v_table in array array['sessions', 'participants', 'votes'] loop
    if to_regclass(format('rollback_20260825_session_integrity.%I', v_table)) is null then
      raise exception 'Rollback aborted: backup snapshot %.% is missing',
        'rollback_20260825_session_integrity', v_table;
    end if;
  end loop;

  for v_table, v_column in
    select *
    from (values
      ('sessions', 'id'),
      ('sessions', 'status'),
      ('sessions', 'current_round'),
      ('sessions', 'created_at'),
      ('sessions', 'join_code'),
      ('sessions', 'votes_revealed'),
      ('sessions', 'started'),
      ('sessions', 'consensus_streak'),
      ('participants', 'id'),
      ('participants', 'session_id'),
      ('participants', 'name'),
      ('participants', 'role'),
      ('participants', 'joined_at'),
      ('votes', 'id'),
      ('votes', 'session_id'),
      ('votes', 'participant_id'),
      ('votes', 'round'),
      ('votes', 'size'),
      ('votes', 'value'),
      ('votes', 'created_at')
    ) required(table_name, column_name)
  loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'rollback_20260825_session_integrity'
        and c.table_name = v_table
        and c.column_name = v_column
    ) then
      v_missing_columns := concat_ws(', ', v_missing_columns, v_table || '.' || v_column);
    end if;
  end loop;

  if v_missing_columns is not null then
    raise exception 'Rollback aborted: backup snapshots lack required columns: %',
      v_missing_columns;
  end if;

  foreach v_table in array array['sessions', 'participants', 'votes'] loop
    execute format(
      'select count(*) from ('
      || 'select id from rollback_20260825_session_integrity.%I '
      || 'group by id having count(*) > 1'
      || ') duplicates',
      v_table
    ) into v_count;

    if v_count > 0 then
      raise exception 'Rollback aborted: backup snapshot % contains duplicate IDs', v_table;
    end if;
  end loop;

  select count(*) into v_count
  from rollback_20260825_session_integrity.sessions
  where status = 'active';

  if v_count <> 17 then
    raise exception
      'Rollback aborted: expected exactly 17 active legacy sessions in the backup, found %',
      v_count;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sessions'
      and column_name = 'facilitator_user_id'
  ) then
    execute $sql$
      select count(*)
      from public.sessions
      where status = 'active'
        and facilitator_user_id is not null
    $sql$ into v_count;

    if v_count > 0 then
      raise exception
        'Rollback aborted: found % active auth-based sessions. Reconcile them explicitly in the maintenance window before retrying; this script will not delete them',
        v_count;
    end if;
  end if;

  select count(*) into v_new_sessions
  from public.sessions live
  where not exists (
    select 1
    from rollback_20260825_session_integrity.sessions snapshot
    where snapshot.id = live.id
  );

  select count(*) into v_new_participants
  from public.participants live
  where not exists (
    select 1
    from rollback_20260825_session_integrity.participants snapshot
    where snapshot.id = live.id
  );

  select count(*) into v_new_votes
  from public.votes live
  where not exists (
    select 1
    from rollback_20260825_session_integrity.votes snapshot
    where snapshot.id = live.id
  );

  if v_new_sessions > 0 or v_new_participants > 0 or v_new_votes > 0 then
    raise exception
      'Rollback aborted: post-cutover rows exist (sessions %, participants %, votes %). Export/reconcile them explicitly; this script never deletes or overwrites new rows',
      v_new_sessions, v_new_participants, v_new_votes;
  end if;

  -- Existing snapshot rows may differ only by the additive migration's forced
  -- active -> completed status transition. Any other difference is unexpected
  -- and must be reconciled instead of overwritten blindly.
  select count(*) into v_count
  from public.sessions live
  join rollback_20260825_session_integrity.sessions snapshot using (id)
  where live.current_round is distinct from snapshot.current_round
     or live.created_at is distinct from snapshot.created_at
     or live.join_code is distinct from snapshot.join_code
     or live.votes_revealed is distinct from snapshot.votes_revealed
     or live.started is distinct from snapshot.started
     or live.consensus_streak is distinct from snapshot.consensus_streak
     or (
       live.status is distinct from snapshot.status
       and not (snapshot.status = 'active' and live.status = 'completed')
     );

  if v_count > 0 then
    raise exception
      'Rollback aborted: % existing sessions have unexpected post-cutover changes', v_count;
  end if;

  select count(*) into v_count
  from public.participants live
  join rollback_20260825_session_integrity.participants snapshot using (id)
  where live.session_id is distinct from snapshot.session_id
     or live.name is distinct from snapshot.name
     or live.role is distinct from snapshot.role
     or live.joined_at is distinct from snapshot.joined_at;

  if v_count > 0 then
    raise exception
      'Rollback aborted: % existing participants have unexpected post-cutover changes', v_count;
  end if;

  select count(*) into v_count
  from public.votes live
  join rollback_20260825_session_integrity.votes snapshot using (id)
  where live.session_id is distinct from snapshot.session_id
     or live.participant_id is distinct from snapshot.participant_id
     or live.round is distinct from snapshot.round
     or live.size is distinct from snapshot.size
     or live.value is distinct from snapshot.value
     or live.created_at is distinct from snapshot.created_at;

  if v_count > 0 then
    raise exception
      'Rollback aborted: % existing votes have unexpected post-cutover changes', v_count;
  end if;

  select count(*) into v_count
  from rollback_20260825_session_integrity.participants p
  left join rollback_20260825_session_integrity.sessions s on s.id = p.session_id
  where s.id is null;

  if v_count > 0 then
    raise exception 'Rollback aborted: backup contains % orphan participants', v_count;
  end if;

  select count(*) into v_count
  from rollback_20260825_session_integrity.votes v
  left join rollback_20260825_session_integrity.sessions s on s.id = v.session_id
  left join rollback_20260825_session_integrity.participants p
    on p.id = v.participant_id
   and p.session_id = v.session_id
  where s.id is null or p.id is null;

  if v_count > 0 then
    raise exception 'Rollback aborted: backup contains % orphan or cross-session votes', v_count;
  end if;
end;
$preflight$;

-- Remove lockdown and Realtime Presence policies before their dependencies.
drop policy if exists "Members can read their sessions" on public.sessions;
drop policy if exists "Members can read session participants" on public.participants;
drop policy if exists "Authorized members can read votes" on public.votes;

do $drop_optional_policies$
begin
  if to_regclass('public.round_participants') is not null then
    execute 'drop policy if exists "Members can read round participation" on public.round_participants';
  end if;

  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "Session members can read presence" on realtime.messages';
    execute 'drop policy if exists "Session members can publish presence" on realtime.messages';
  end if;
end;
$drop_optional_policies$;

-- Drop the additive RPC API while all referenced tables and columns still exist.
drop function if exists public.create_session(uuid, text);
drop function if exists public.join_session(text, text);
drop function if exists public.restore_session(uuid);
drop function if exists public.claim_round(uuid);
drop function if exists public.cast_vote(uuid, integer, text, text);
drop function if exists public.retract_vote(uuid, integer);
drop function if exists public.start_session(uuid);
drop function if exists public.reveal_votes(uuid);
drop function if exists public.next_round(uuid);
drop function if exists public.end_session(uuid);
drop function if exists public.leave_session(uuid);
drop function if exists public.get_round_vote_statuses(uuid, integer);

-- Drop only session-integrity helpers. Keep the private schema because unrelated
-- private objects may exist now or in the future.
do $drop_private_helpers$
begin
  if to_regnamespace('private') is not null then
    execute 'drop function if exists private.can_read_vote(uuid, uuid, integer)';
    execute 'drop function if exists private.is_session_member(uuid)';
    execute 'drop function if exists private.can_access_presence_topic(text)';
  end if;
end;
$drop_private_helpers$;

-- Remove round_participants from Realtime before dropping the table. The guard
-- keeps reruns safe when the publication or membership has already been removed.
do $drop_round_publication$
begin
  if exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'round_participants'
  ) then
    execute 'alter publication supabase_realtime drop table public.round_participants';
  end if;
end;
$drop_round_publication$;

drop table if exists public.round_participants;

-- Remove additive constraints and indexes before their supporting columns.
alter table public.votes
  drop constraint if exists votes_session_participant_fkey,
  drop constraint if exists votes_round_positive;

alter table public.participants
  drop constraint if exists participants_session_id_id_key,
  drop constraint if exists participants_name_valid;

alter table public.sessions
  drop constraint if exists sessions_current_round_positive;

drop index if exists public.participants_session_user_uidx;
drop index if exists public.sessions_one_active_facilitator_uidx;
drop index if exists public.sessions_facilitator_create_request_uidx;

alter table public.participants
  drop column if exists left_at,
  drop column if exists user_id;

alter table public.sessions
  drop column if exists create_request_id,
  drop column if exists facilitator_user_id;

-- The constraint can already exist on a rerun. Remove it before snapshot restore
-- so the same deterministic cleanup path handles backup duplicates every time.
alter table public.participants
  drop constraint if exists unique_participant_name_per_session;

-- Restore legacy rows without deleting anything. The preflight guarantees that
-- live rows are from the snapshot and have no unexpected changes. Missing rows
-- can therefore be reinserted safely in foreign-key order.
insert into public.sessions (
  id,
  status,
  current_round,
  created_at,
  join_code,
  votes_revealed,
  started,
  consensus_streak
)
select
  id,
  status,
  current_round,
  created_at,
  join_code,
  votes_revealed,
  started,
  consensus_streak
from rollback_20260825_session_integrity.sessions
on conflict (id) do update
set status = excluded.status,
    current_round = excluded.current_round,
    created_at = excluded.created_at,
    join_code = excluded.join_code,
    votes_revealed = excluded.votes_revealed,
    started = excluded.started,
    consensus_streak = excluded.consensus_streak;

insert into public.participants (
  id,
  session_id,
  name,
  role,
  joined_at
)
select
  id,
  session_id,
  name,
  role,
  joined_at
from rollback_20260825_session_integrity.participants
on conflict (id) do update
set session_id = excluded.session_id,
    name = excluded.name,
    role = excluded.role,
    joined_at = excluded.joined_at;

insert into public.votes (
  id,
  session_id,
  participant_id,
  round,
  size,
  value,
  created_at
)
select
  id,
  session_id,
  participant_id,
  round,
  size,
  value,
  created_at
from rollback_20260825_session_integrity.votes
on conflict (id) do update
set session_id = excluded.session_id,
    participant_id = excluded.participant_id,
    round = excluded.round,
    size = excluded.size,
    value = excluded.value,
    created_at = excluded.created_at;

-- Migration 008 kept the oldest participant for each exact session/name pair.
-- Add UUID as a deterministic tie-breaker when joined_at is equal.
with ranked_participants as (
  select
    id,
    row_number() over (
      partition by session_id, name
      order by joined_at, id
    ) as duplicate_rank
  from public.participants
)
delete from public.participants p
using ranked_participants ranked
where p.id = ranked.id
  and ranked.duplicate_rank > 1;

do $restore_unique_name_constraint$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'participants'
      and c.conname = 'unique_participant_name_per_session'
  ) then
    if to_regclass('public.unique_participant_name_per_session') is not null then
      raise exception
        'Rollback aborted: index unique_participant_name_per_session exists without the expected constraint';
    end if;

    alter table public.participants
      add constraint unique_participant_name_per_session
      unique (session_id, name);
  end if;
end;
$restore_unique_name_constraint$;

-- Restore legacy Realtime payloads and ensure the original three publication
-- memberships exist. FULL is required by deployment fd5c462, including DELETEs.
alter table public.sessions replica identity full;
alter table public.participants replica identity full;
alter table public.votes replica identity full;

do $restore_legacy_publication$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Rollback aborted: publication supabase_realtime is missing';
  end if;

  foreach v_table in array array['sessions', 'participants', 'votes'] loop
    if not exists (
      select 1
      from pg_publication p
      join pg_publication_rel pr on pr.prpubid = p.oid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      where p.pubname = 'supabase_realtime'
        and n.nspname = 'public'
        and c.relname = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$restore_legacy_publication$;

-- Restore the legacy frontend's minimum table grants deterministically. RLS
-- policies below remain the row-access boundary.
alter table public.sessions enable row level security;
alter table public.participants enable row level security;
alter table public.votes enable row level security;

revoke all privileges on table public.sessions from anon, authenticated;
revoke all privileges on table public.participants from anon, authenticated;
revoke all privileges on table public.votes from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.sessions to anon, authenticated;
grant select, insert, update, delete on table public.participants to anon, authenticated;
grant select, insert, delete on table public.votes to anon, authenticated;

-- Recreate rather than trust same-named policies with unknown definitions.
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

-- PostgreSQL has no CREATE POLICY IF NOT EXISTS. These guards restore the exact
-- open policies from migrations 005, 008 and 009 without failing on reruns.
do $restore_legacy_policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sessions'
      and policyname = 'Alle kan lese sessions'
  ) then
    create policy "Alle kan lese sessions"
      on public.sessions for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sessions'
      and policyname = 'Alle kan opprette sessions'
  ) then
    create policy "Alle kan opprette sessions"
      on public.sessions for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sessions'
      and policyname = 'Alle kan oppdatere sessions'
  ) then
    create policy "Alle kan oppdatere sessions"
      on public.sessions for update using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'participants'
      and policyname = 'Alle kan lese participants'
  ) then
    create policy "Alle kan lese participants"
      on public.participants for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'participants'
      and policyname = 'Alle kan registrere seg som participant'
  ) then
    create policy "Alle kan registrere seg som participant"
      on public.participants for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'participants'
      and policyname = 'Kan oppdatere egen participant'
  ) then
    create policy "Kan oppdatere egen participant"
      on public.participants for update using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'participants'
      and policyname = 'Kan slette participants'
  ) then
    create policy "Kan slette participants"
      on public.participants for delete using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'votes'
      and policyname = 'Alle kan lese votes'
  ) then
    create policy "Alle kan lese votes"
      on public.votes for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'votes'
      and policyname = 'Alle kan stemme'
  ) then
    create policy "Alle kan stemme"
      on public.votes for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'votes'
      and policyname = 'Kan slette egne votes'
  ) then
    create policy "Kan slette egne votes"
      on public.votes for delete using (true);
  end if;
end;
$restore_legacy_policies$;

-- Final assertions execute before COMMIT so any incomplete rollback remains
-- atomic and leaves the cutover schema untouched.
do $verify$
declare
  v_count bigint;
  v_table text;
  v_policy text;
begin
  select count(*) into v_count
  from public.sessions
  where status = 'active';

  if v_count <> 17 then
    raise exception 'Rollback verification failed: expected 17 active sessions, found %', v_count;
  end if;

  select count(*) into v_count
  from rollback_20260825_session_integrity.sessions snapshot
  left join public.sessions live on live.id = snapshot.id
  where live.id is null
     or row(
       live.status,
       live.current_round,
       live.created_at,
       live.join_code,
       live.votes_revealed,
       live.started,
       live.consensus_streak
     ) is distinct from row(
       snapshot.status,
       snapshot.current_round,
       snapshot.created_at,
       snapshot.join_code,
       snapshot.votes_revealed,
       snapshot.started,
       snapshot.consensus_streak
     );

  if v_count > 0 then
    raise exception 'Rollback verification failed: % session snapshots were not restored', v_count;
  end if;

  with ranked_snapshot as (
    select
      snapshot.*,
      row_number() over (
        partition by snapshot.session_id, snapshot.name
        order by snapshot.joined_at, snapshot.id
      ) as duplicate_rank
    from rollback_20260825_session_integrity.participants snapshot
  )
  select count(*) into v_count
  from ranked_snapshot snapshot
  left join public.participants live on live.id = snapshot.id
  where snapshot.duplicate_rank = 1
    and (
      live.id is null
      or row(live.session_id, live.name, live.role, live.joined_at)
         is distinct from
         row(snapshot.session_id, snapshot.name, snapshot.role, snapshot.joined_at)
    );

  if v_count > 0 then
    raise exception 'Rollback verification failed: % participant snapshots were not restored',
      v_count;
  end if;

  with ranked_participants as (
    select
      id,
      row_number() over (
        partition by session_id, name
        order by joined_at, id
      ) as duplicate_rank
    from rollback_20260825_session_integrity.participants
  )
  select count(*) into v_count
  from rollback_20260825_session_integrity.votes snapshot
  join ranked_participants participant
    on participant.id = snapshot.participant_id
   and participant.duplicate_rank = 1
  left join public.votes live on live.id = snapshot.id
  where live.id is null
     or row(
       live.session_id,
       live.participant_id,
       live.round,
       live.size,
       live.value,
       live.created_at
     ) is distinct from row(
       snapshot.session_id,
       snapshot.participant_id,
       snapshot.round,
       snapshot.size,
       snapshot.value,
       snapshot.created_at
     );

  if v_count > 0 then
    raise exception 'Rollback verification failed: % vote snapshots were not restored', v_count;
  end if;

  if to_regclass('public.round_participants') is not null then
    raise exception 'Rollback verification failed: public.round_participants still exists';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'sessions' and column_name in ('facilitator_user_id', 'create_request_id'))
        or (table_name = 'participants' and column_name in ('user_id', 'left_at'))
      )
  ) then
    raise exception 'Rollback verification failed: additive identity columns still exist';
  end if;

  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname in ('sessions', 'participants', 'votes')
      and c.conname in (
        'sessions_current_round_positive',
        'participants_name_valid',
        'participants_session_id_id_key',
        'votes_round_positive',
        'votes_session_participant_fkey'
      )
  ) then
    raise exception 'Rollback verification failed: additive constraints still exist';
  end if;

  if to_regclass('public.sessions_facilitator_create_request_uidx') is not null
     or to_regclass('public.sessions_one_active_facilitator_uidx') is not null
     or to_regclass('public.participants_session_user_uidx') is not null then
    raise exception 'Rollback verification failed: additive indexes still exist';
  end if;

  if to_regprocedure('public.create_session(uuid,text)') is not null
     or to_regprocedure('public.join_session(text,text)') is not null
     or to_regprocedure('public.restore_session(uuid)') is not null
     or to_regprocedure('public.claim_round(uuid)') is not null
     or to_regprocedure('public.cast_vote(uuid,integer,text,text)') is not null
     or to_regprocedure('public.retract_vote(uuid,integer)') is not null
     or to_regprocedure('public.start_session(uuid)') is not null
     or to_regprocedure('public.reveal_votes(uuid)') is not null
     or to_regprocedure('public.next_round(uuid)') is not null
     or to_regprocedure('public.end_session(uuid)') is not null
     or to_regprocedure('public.leave_session(uuid)') is not null
     or to_regprocedure('public.get_round_vote_statuses(uuid,integer)') is not null
     or to_regprocedure('private.is_session_member(uuid)') is not null
     or to_regprocedure('private.can_read_vote(uuid,uuid,integer)') is not null then
    raise exception 'Rollback verification failed: additive RPC or helper functions still exist';
  end if;

  foreach v_table in array array['sessions', 'participants', 'votes'] loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relreplident = 'f'
    ) then
      raise exception 'Rollback verification failed: %.% replica identity is not FULL',
        'public', v_table;
    end if;

    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relrowsecurity
    ) then
      raise exception 'Rollback verification failed: RLS is not enabled on %.%',
        'public', v_table;
    end if;

    if not exists (
      select 1
      from pg_publication p
      join pg_publication_rel pr on pr.prpubid = p.oid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      where p.pubname = 'supabase_realtime'
        and n.nspname = 'public'
        and c.relname = v_table
    ) then
      raise exception 'Rollback verification failed: %.% is not in supabase_realtime',
        'public', v_table;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'participants'
      and c.conname = 'unique_participant_name_per_session'
      and c.contype = 'u'
  ) then
    raise exception
      'Rollback verification failed: unique_participant_name_per_session is missing';
  end if;

  for v_table, v_policy in
    select *
    from (values
      ('sessions', 'Alle kan lese sessions'),
      ('sessions', 'Alle kan opprette sessions'),
      ('sessions', 'Alle kan oppdatere sessions'),
      ('participants', 'Alle kan lese participants'),
      ('participants', 'Alle kan registrere seg som participant'),
      ('participants', 'Kan oppdatere egen participant'),
      ('participants', 'Kan slette participants'),
      ('votes', 'Alle kan lese votes'),
      ('votes', 'Alle kan stemme'),
      ('votes', 'Kan slette egne votes')
    ) required(table_name, policy_name)
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname = v_policy
    ) then
      raise exception 'Rollback verification failed: policy % on % is missing',
        v_policy, v_table;
    end if;
  end loop;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname in (
        'Session members can read presence',
        'Session members can publish presence'
      )
  ) then
    raise exception 'Rollback verification failed: lockdown Presence policies still exist';
  end if;

  if not has_table_privilege('anon', 'public.sessions', 'select')
     or not has_table_privilege('anon', 'public.sessions', 'insert')
     or not has_table_privilege('anon', 'public.sessions', 'update')
     or not has_table_privilege('authenticated', 'public.sessions', 'select')
     or not has_table_privilege('authenticated', 'public.sessions', 'insert')
     or not has_table_privilege('authenticated', 'public.sessions', 'update')
     or not has_table_privilege('anon', 'public.participants', 'select')
     or not has_table_privilege('anon', 'public.participants', 'insert')
     or not has_table_privilege('anon', 'public.participants', 'update')
     or not has_table_privilege('anon', 'public.participants', 'delete')
     or not has_table_privilege('authenticated', 'public.participants', 'select')
     or not has_table_privilege('authenticated', 'public.participants', 'insert')
     or not has_table_privilege('authenticated', 'public.participants', 'update')
     or not has_table_privilege('authenticated', 'public.participants', 'delete')
     or not has_table_privilege('anon', 'public.votes', 'select')
     or not has_table_privilege('anon', 'public.votes', 'insert')
     or not has_table_privilege('anon', 'public.votes', 'delete')
     or not has_table_privilege('authenticated', 'public.votes', 'select')
     or not has_table_privilege('authenticated', 'public.votes', 'insert')
     or not has_table_privilege('authenticated', 'public.votes', 'delete') then
    raise exception 'Rollback verification failed: legacy anon/authenticated grants are incomplete';
  end if;
end;
$verify$;

commit;
