# Health Check concurrency verification

## Status

Required before production rollout. pgTAP verifies contracts in one transaction;
this plan proves serialization with two independent local `psql` sessions.

## Prerequisites

Start a disposable local stack and apply the member-scoped RLS prerequisite and
health migration as documented in `README.md`. Run
`supabase/tests/health_check_rpc_test.sql` once to validate the fixture logic.
Use the direct local connection in two terminals:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1
```

Create a fresh fixture for each case (change the final UUID digits between
cases). The following setup creates six respondents and starts collection:

```sql
insert into auth.users (id, aud, role, created_at, updated_at)
select id, 'authenticated', 'authenticated', now(), now()
from unnest(array[
  '71000000-0000-0000-0000-000000000001'::uuid,
  '71000000-0000-0000-0000-000000000002'::uuid,
  '71000000-0000-0000-0000-000000000003'::uuid,
  '71000000-0000-0000-0000-000000000004'::uuid,
  '71000000-0000-0000-0000-000000000005'::uuid,
  '71000000-0000-0000-0000-000000000006'::uuid,
  '71000000-0000-0000-0000-000000000007'::uuid
]) id on conflict (id) do nothing;

set role service_role;
select public.create_health_check_room(
  '71000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001', 'Facilitator', 'Concurrency',
  current_date, '73000000-0000-0000-0000-000000000001'
) as created \gset
select :'created'::jsonb->'session'->>'id' as room_id,
       :'created'::jsonb->'session'->>'join_code' as join_code \gset
select public.join_health_check_room(id, :'join_code', 'Member ' || ordinality)
from unnest(array[
  '71000000-0000-0000-0000-000000000002'::uuid,
  '71000000-0000-0000-0000-000000000003'::uuid,
  '71000000-0000-0000-0000-000000000004'::uuid,
  '71000000-0000-0000-0000-000000000005'::uuid,
  '71000000-0000-0000-0000-000000000006'::uuid,
  '71000000-0000-0000-0000-000000000007'::uuid
]) with ordinality members(id, ordinality);
reset role;
set role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', false);
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', false);
select public.start_health_check(:'room_id'::uuid);
reset role;
select id as member_id from public.participants
where session_id = :'room_id'::uuid
  and user_id = '71000000-0000-0000-0000-000000000002'::uuid \gset
```

Record the variables in both terminals:

```sql
\set room_id 'ROOM_UUID'
\set member_user_id 'MEMBER_AUTH_UUID'
\set member_id 'MEMBER_PARTICIPANT_UUID'
\set facilitator_user_id 'FACILITATOR_AUTH_UUID'
```

Every authenticated transaction starts with:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', :'member_user_id', true);
set local lock_timeout = '10s';
```

Use the facilitator UUID instead for facilitator RPCs. SQLSTATE expectations are
`22023` for domain conflicts and `42501` for authorization failures.

## Deterministic barrier

Session A acquires the room lock before calling its RPC:

```sql
begin;
select 1 from public.sessions where id = :'room_id'::uuid for update;
```

Start Session B's RPC and verify it waits in `pg_stat_activity`, then run A's RPC
and commit A. The shared room-row lock gives an explicit commit order without an
unpaired advisory lock. Repeat each case with A/B reversed.

## Submit versus remove

Session A locks the room, then submits as the member:

```sql
select public.submit_health_check(
  :'room_id'::uuid,
  array_fill(4::smallint, array[31])
);
commit;
```

Session B calls `remove_health_check_respondent(room_id, member_id)` as the
facilitator. Expected: submit-first returns `completed`, remove gets SQLSTATE
`22023` / `completed_respondent_locked`; remove-first returns `removed`, submit
gets SQLSTATE `42501` / `respondent_required`.

```sql
select r.state, count(a.*), min(a.response_count), max(a.response_count)
from public.health_check_respondents r
join public.health_check_question_aggregates a on a.room_id = r.room_id
where r.room_id = :'room_id'::uuid and r.member_id = :'member_id'::uuid
group by r.state;
```

The only valid outcomes are one completed respondent with 31 increments, or no
respondent with zero increments from that attempt.

## Double submit

Run identical submit RPCs in A and B for the same member. Commit A first, then B.
Expected: one `completed`; one SQLSTATE `22023` / `already_completed`.

```sql
select count(*), min(response_count), max(response_count)
from public.health_check_question_aggregates where room_id = :'room_id'::uuid;
```

Expected: 31 rows and every count incremented exactly once.

## Submit versus finalize

Leave one member in progress. Session A submits that member while Session B calls
`finalize_health_check` as facilitator. Submit-first permits finalize and creates
one `awaiting_materialization` job. Finalize-first gets SQLSTATE `22023` /
`health_check_incomplete` and creates no job.

```sql
select h.phase, s.status, j.id, j.status
from public.health_check_sessions h
join public.sessions s on s.id = h.room_id
left join public.health_check_report_jobs j on j.source_room_id = h.room_id
where h.room_id = :'room_id'::uuid;
```

No job may coexist with partial aggregate counts.

## Remove versus finalize

Use six respondents: five completed and one in progress. Race removal of the
in-progress member against finalize. Remove-first allows finalization of five;
finalize-first gets `health_check_incomplete`. A job exists only for a fully
completed cohort of at least five.

## Double finalize

With five completed respondents, race two finalize calls. Both must return the
same delivery ID and `awaiting_materialization`; exactly one job may exist:

```sql
select count(*), min(id), max(id), min(status), max(status)
from public.health_check_report_jobs where source_room_id = :'room_id'::uuid;
```

Expected count: `1`, identical IDs, identical status.

## Abort versus mutations

Race `abort_health_check` as facilitator against submit, remove and finalize in
three fresh fixtures. Abort serializes on the room row. If abort commits first,
the other RPC gets its generic authorization/unavailable error. If the mutation
commits first, abort either removes the pre-delivery room or gets SQLSTATE
`22023` / `health_check_abort_locked` after finalization. Verify no orphan rows:

```sql
select
  (select count(*) from public.sessions where id = :'room_id'::uuid) sessions,
  (select count(*) from public.participants where session_id = :'room_id'::uuid) participants,
  (select count(*) from public.health_check_sessions where room_id = :'room_id'::uuid) health_sessions,
  (select count(*) from public.health_check_respondents where room_id = :'room_id'::uuid) respondents,
  (select count(*) from public.health_check_question_aggregates where room_id = :'room_id'::uuid) aggregates,
  (select count(*) from public.health_check_report_jobs where source_room_id = :'room_id'::uuid) jobs;
```

Etter vellykket materialisering skal de fem første tellerne være `0`, mens en
separat telling på delivery-ID skal vise nøyaktig én `ready` jobb. Gjenta
`finalize_health_check(room_id)` som fasilitator etter sletting; den skal returnere
samme jobb. En outsider skal få `42501` / `facilitator_required`. Gjentatt abort
etter sletting skal også få den dokumenterte generiske unavailable-feilen.

## Worker versus cleanup

Use a fresh, live finalized fixture for every ordering: complete the cohort and
finalize normally, then use `session_replication_role = replica` only to move the
existing source and job expiry to the same instant about 20 seconds in the
future. Restore `session_replication_role = origin`, claim while still alive as
`service_role` with a one-minute lease, and copy the exact expiry into every
terminal as `expires_at`. Never construct an already expired job and describe it
as claimable. Run claim, fail, materialize and cleanup with `set local role
service_role`; the pgTAP suite separately requires `42501` for all three worker
mutations under `authenticated`.

### Materialize holds job lock while cleanup waits

In Session A, begin before expiry, lock the claimed job, and wait across expiry.
Use a savepoint because the expected materialization error aborts its subtransaction:

```sql
begin;
set local role service_role;
set local lock_timeout = '30s';
select 1 from public.health_check_report_jobs
 where id = :'delivery_id'::uuid for update;
select pg_sleep_until(:'expires_at'::timestamptz + interval '1 second');
savepoint materialize_after_expiry;
select private.materialize_health_check_download(
  :'delivery_id'::uuid, 'expiry-race-worker',
  decode(repeat('ab', 64), 'hex'), decode(repeat('01', 12), 'hex'),
  1, 'expiry-race.zip'
);
```

Materialization must get SQLSTATE `55000` / `job_expired`. Keep A open after
`rollback to savepoint materialize_after_expiry`. Start cleanup in Session B; it
must wait on A's job-row lock. Commit A. Cleanup must then delete the expired job
and source room without an FK-trigger rollback.

### Materialize waits on source while cleanup waits on job

This ordering needs a third terminal. Session A locks the live source row and
waits across expiry. Before expiry, Session B starts materialization: it locks the
job and waits on A's source lock. After expiry, Session C starts cleanup and must
wait on B's job lock. Commit A. B must get `55000` / `job_expired`; roll back B.
Cleanup can then delete the job and source. Package fields and `materialized_at`
must remain null throughout.

### Cleanup wins

With another live finalized fixture, claim while alive, wait until its recorded
expiry, then let cleanup commit before a worker call. The later claim returns
`false`; materialization returns `55000` / `health_check_report_job_not_claimed`.
Both source and job counts remain zero.

### Stale lease and one-run cutoff

For a live, unexpired job with an expired processing lease, cleanup changes the
job to `failed`, clears claim and lease, sets `next_attempt_at` to the run cutoff,
and retains the room. To verify the cutoff under blocking, lock a separate expired
sentinel job in Session A. Before starting cleanup, set a still-live target job
and source to expire about 20 seconds in the future. Start cleanup in Session B,
confirm it is blocked on the sentinel before the target expiry, and then wait
until after the target's recorded expiry. After A commits, the same cleanup run
deletes the sentinel but must leave the target job and room unchanged for the
next run because their expiry was later than B's captured cutoff.

### Snapshot waits on the common session row until its lease expires

Use a fresh finalized fixture with `room_id` and `delivery_id` recorded in both
terminals. Keep the source and job expiry at least five minutes in the future.
Acquire the common session-row lock before claiming so setup time does not
consume the lease:

```sql
-- Terminal A
begin;
select 1 from public.sessions where id = :'room_id'::uuid for update;
```

Claim with a short lease immediately before starting the snapshot:

```sql
-- Terminal B: worker setup
begin;
set local role service_role;
select private.claim_health_check_report_job(
  :'delivery_id'::uuid, 'snapshot-lock-worker', interval '60 seconds'
);
select lease_expires_at as lease_expires_at
from public.health_check_report_jobs where id = :'delivery_id'::uuid \gset
\echo :lease_expires_at
commit;
```

Copy the echoed timestamp into Terminal A with
`\set lease_expires_at 'TIMESTAMPTZ_VALUE'` before continuing. Keep Terminal A's
transaction open.

Start the snapshot in Terminal B. It must lock the job and health-session rows,
then wait for Terminal A at the `public.sessions FOR UPDATE`:

```sql
begin;
set local role service_role;
set local lock_timeout = '120s';
select * from public.get_health_check_report_snapshot_for_service(
  :'delivery_id'::uuid, 'snapshot-lock-worker'
);
```

In Terminal A, wait until the exact lease is past, then release the row:

```sql
select pg_sleep_until(:'lease_expires_at'::timestamptz + interval '1 second');
commit;
```

Expected in Terminal B: SQLSTATE `55000` /
`health_check_report_job_not_claimed`, not snapshot rows and not `job_expired`.
Run `rollback;` there. This proves the fresh revalidation immediately after the
session lock observes a lease lost only through elapsed wall time.

### Snapshot waits on catalog validation until its lease expires

This case uses three terminals so lock acquisition and blocking are observable.
Use another fresh finalized fixture, keep source/job expiry at least five minutes
away, and have Terminal A obtain the DDL-strength lock before claiming or
starting the snapshot:

```sql
-- Terminal A
begin;
lock table public.health_check_questions in access exclusive mode;
```

Only after that command returns, claim in Terminal B and echo the exact lease:

```sql
-- Terminal B: worker setup
begin;
set local role service_role;
select private.claim_health_check_report_job(
  :'delivery_id'::uuid, 'snapshot-catalog-worker', interval '60 seconds'
);
select lease_expires_at as lease_expires_at
from public.health_check_report_jobs where id = :'delivery_id'::uuid \gset
\echo :lease_expires_at
commit;
```

Copy the echoed value into Terminal A with
`\set lease_expires_at 'TIMESTAMPTZ_VALUE'`. Then start the snapshot in Terminal
B:

```sql
begin;
set local role service_role;
set local lock_timeout = '120s';
select * from public.get_health_check_report_snapshot_for_service(
  :'delivery_id'::uuid, 'snapshot-catalog-worker'
);
```

The snapshot locks job, health-session and common session rows, completes the
template/area checks, then blocks when catalog validation selects
`health_check_questions`. Confirm the wait from Terminal C:

```sql
select pid, wait_event_type, wait_event, pg_blocking_pids(pid)
from pg_stat_activity
where query like '%get_health_check_report_snapshot_for_service%'
  and state = 'active';
```

Terminal C must show a lock wait and Terminal A's PID as blocker. In Terminal A,
wait past the lease copied during claim and release the catalog lock:

```sql
select pg_sleep_until(:'lease_expires_at'::timestamptz + interval '1 second');
commit;
```

Expected in Terminal B after all catalog and aggregate invariants finish:
SQLSTATE `55000` / `health_check_report_job_not_claimed`, before the return query
can emit any row. Run `rollback;`. This proves the final fresh-clock check catches
a lease lost while a non-row-lock validation query was blocked. If the fixture
does not otherwise pass every invariant, discard it and repeat; an invariant
error does not test the pre-return lease check.

For every ordering, verify:

```sql
select status, claimed_by, lease_expires_at, encrypted_package, materialized_at
from public.health_check_report_jobs where id = :'delivery_id'::uuid;
select count(*) from public.sessions where id = :'room_id'::uuid;
```

After deletion both counts are zero. Before deletion, no failed/expired
materialization may populate package fields or remove the source room.

## Session RPC realism blocker

The focused health compatibility calls for common `join_session`,
`restore_session` and `leave_session` run with `set local role authenticated`
plus JWT `role` and `sub`. The older broad estimation section still changes JWT
subjects while executing mainly as the test owner; converting that whole legacy
fixture safely is separate work and remains a runtime-release blocker rather
than being represented as authenticated coverage here.

Docker is unavailable in the current environment, so this complete multi-session
runtime plan remains an explicit production release blocker. It does not block a
local source commit after static checks and non-database tests pass.

## Evidence

Store both terminal transcripts, commit order, observed SQLSTATE/message and all
invariant-query results with the release evidence. Any timeout, deadlock, orphan,
duplicate job, partial aggregate or `ready` job without a complete encrypted package is
a release blocker.
