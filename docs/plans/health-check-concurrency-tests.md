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
insert into auth.users (id, aud, role, email, created_at, updated_at)
select id, 'authenticated', 'authenticated', id::text || '@test.invalid', now(), now()
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
  current_date, '73000000-0000-0000-0000-000000000001',
  decode(repeat('ab', 32), 'hex'), decode(repeat('01', 12), 'hex'), 1
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
select pg_advisory_lock(90426001);
select 1 from public.sessions where id = :'room_id'::uuid for update;
```

Start Session B's RPC; verify it waits in `pg_stat_activity`. Release A with
`select pg_advisory_unlock(90426001);` and then commit A. This gives an explicit
commit order without relying on typing speed. Repeat each case with A/B reversed.

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
  (select count(*) from public.health_check_respondents where room_id = :'room_id'::uuid) respondents,
  (select count(*) from public.health_check_question_aggregates where room_id = :'room_id'::uuid) aggregates,
  (select count(*) from public.health_check_report_jobs where source_room_id = :'room_id'::uuid) jobs;
```

## Worker versus cleanup

Create an expired fixture using `session_replication_role = replica`, including
its outbox job. Session A locks the job row as a worker; Session B runs
`private.cleanup_expired_health_checks()` as `service_role`. Cleanup must wait,
then delete the job before the RESTRICT-linked room. Reverse the order and verify
the worker finds no job.

```sql
select count(*) from public.health_check_report_jobs where id = :'delivery_id'::uuid;
select count(*) from public.sessions where id = :'room_id'::uuid;
```

Both counts must be zero. Also test an expired `processing` lease on an unexpired
job: cleanup changes it to `failed`, clears claim/lease, and leaves the room.

## Evidence

Store both terminal transcripts, commit order, observed SQLSTATE/message and all
invariant-query results with the release evidence. Any timeout, deadlock, orphan,
duplicate job, partial aggregate or `pending` job without encrypted snapshot is
a release blocker.
