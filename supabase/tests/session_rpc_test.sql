-- Run after the additive migration, before or independently of lockdown.
-- `supabase test db supabase/tests/session_rpc_test.sql`
-- Requires the local Supabase stack and pgTAP (included by the Supabase image).
begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(69);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'facilitator@test.invalid', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'participant-a@test.invalid', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'participant-b@test.invalid', now(), now()),
  ('10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'outsider@test.invalid', now(), now()),
  ('10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'health-facilitator@test.invalid', now(), now()),
  ('10000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'health-member@test.invalid', now(), now());

create temporary table session_test_context (
  key text primary key,
  value text not null
);

grant all on session_test_context to authenticated;

select extensions.is(
  (select count(*)::text from public.sessions where status = 'active' and facilitator_user_id is null),
  '0',
  'additive cutover leaves no active legacy session restorable'
);

select extensions.ok(
  exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'sessions'
       and column_name = 'activity_type'
       and is_nullable = 'NO'
       and column_default = '''estimation''::text'
  ),
  'activity_type is non-null with estimation default'
);

select extensions.ok(
  exists (
    select 1
      from pg_constraint
     where conrelid = 'public.sessions'::regclass
       and conname = 'sessions_activity_type_valid'
       and convalidated
       and pg_get_constraintdef(oid) like '%activity_type%estimation%health_check%'
  ),
  'activity_type check is present and validated'
);

select extensions.is(
  (select count(*)::text from public.sessions where activity_type <> 'estimation'),
  '0',
  'existing session rows are backfilled as estimation'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
insert into session_test_context (key, value)
select 'create_result', public.create_session(
  '20000000-0000-0000-0000-000000000001',
  '  Sam  '
)::text;

insert into session_test_context (key, value)
select 'session_id', value::jsonb->'session'->>'id'
from session_test_context where key = 'create_result';

insert into session_test_context (key, value)
select 'join_code', value::jsonb->'session'->>'join_code'
from session_test_context where key = 'create_result';

insert into session_test_context (key, value)
select 'facilitator_participant_id', value::jsonb->'participant'->>'id'
from session_test_context where key = 'create_result';

select extensions.is(
  (select value::jsonb->>'status' from session_test_context where key = 'create_result'),
  'ok',
  'create_session creates the session atomically'
);

select extensions.is(
  (select value::jsonb->'session'->>'activity_type' from session_test_context where key = 'create_result'),
  'estimation',
  'create_session returns explicit estimation activity type'
);

select extensions.ok(
  not ((select value::jsonb->'session' from session_test_context where key = 'create_result') ? 'facilitator_user_id')
  and not ((select value::jsonb->'session' from session_test_context where key = 'create_result') ? 'create_request_id')
  and not ((select value::jsonb->'participant' from session_test_context where key = 'create_result') ? 'user_id'),
  'RPC responses strip permanent auth and request identifiers'
);

select extensions.is(
  public.create_session('20000000-0000-0000-0000-000000000099', 'Second')->>'status',
  'active_session_exists',
  'one auth identity cannot create a second active facilitator session'
);

select extensions.is(
  public.create_session(
    '20000000-0000-0000-0000-000000000001',
    'Ignored on retry'
  )->'session'->>'id',
  (select value from session_test_context where key = 'session_id'),
  'create_session is idempotent for user and request id'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select extensions.is(
  public.join_session((select value from session_test_context where key = 'join_code'), 'Fac as participant')->>'status',
  'role_conflict',
  'facilitator cannot join the same session as participant'
);

select extensions.throws_ok(
  format('select public.leave_session(%L::uuid)', (select value from session_test_context where key = 'session_id')),
  '42501',
  'facilitator_cannot_leave',
  'facilitator cannot leave their active session'
);

select extensions.is(
  (
    select count(*)::text
    from public.round_participants
    where session_id = (select value::uuid from session_test_context where key = 'session_id')
      and round = 1
  ),
  '1',
  'create_session creates first-round membership in the same transaction'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
insert into session_test_context (key, value)
select 'join_a_result', public.join_session(
  (select value from session_test_context where key = 'join_code'),
  'Sam'
)::text;

insert into session_test_context (key, value)
select 'participant_a_id', value::jsonb->'participant'->>'id'
from session_test_context where key = 'join_a_result';

select extensions.is(
  public.join_session(
    (select value from session_test_context where key = 'join_code'),
    'Different retry name'
  )->'participant'->>'id',
  (select value from session_test_context where key = 'participant_a_id'),
  'join_session is idempotent per authenticated user'
);

select extensions.is(
  (select value::jsonb->'session'->>'activity_type' from session_test_context where key = 'join_a_result'),
  'estimation',
  'join_session returns explicit estimation activity type'
);

select extensions.ok(
  not ((select value::jsonb->'session' from session_test_context where key = 'join_a_result') ? 'facilitator_user_id')
  and not ((select value::jsonb->'session' from session_test_context where key = 'join_a_result') ? 'create_request_id')
  and not ((select value::jsonb->'participant' from session_test_context where key = 'join_a_result') ? 'user_id'),
  'join_session strips permanent auth and request identifiers'
);

select extensions.is(
  public.restore_session((select value::uuid from session_test_context where key = 'session_id'))->'session'->>'activity_type',
  'estimation',
  'restore_session returns explicit estimation activity type'
);

select extensions.ok(
  not (public.restore_session((select value::uuid from session_test_context where key = 'session_id'))->'session' ? 'facilitator_user_id')
  and not (public.restore_session((select value::uuid from session_test_context where key = 'session_id'))->'session' ? 'create_request_id')
  and not (public.restore_session((select value::uuid from session_test_context where key = 'session_id'))->'participant' ? 'user_id'),
  'restore_session strips permanent auth and request identifiers'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into session_test_context (key, value)
select 'join_b_result', public.join_session(
  (select value from session_test_context where key = 'join_code'),
  'Sam'
)::text;

insert into session_test_context (key, value)
select 'participant_b_id', value::jsonb->'participant'->>'id'
from session_test_context where key = 'join_b_result';

select extensions.isnt(
  (select value from session_test_context where key = 'participant_a_id'),
  (select value from session_test_context where key = 'participant_b_id'),
  'two authenticated users with the same name get separate participants'
);

select extensions.is(
  (select value::jsonb->'participant'->>'role' from session_test_context where key = 'join_b_result'),
  'participant',
  'join_session never grants the facilitator role'
);

select extensions.is(
  public.leave_session((select value::uuid from session_test_context where key = 'session_id'))->>'status',
  'ok',
  'leave_session explicitly deactivates membership'
);

select extensions.is(
  public.restore_session((select value::uuid from session_test_context where key = 'session_id'))->>'status',
  'membership_missing',
  'restore_session rejects a left membership'
);

select extensions.is(
  public.join_session(
    (select value from session_test_context where key = 'join_code'),
    'Sam rejoined'
  )->'participant'->>'id',
  (select value from session_test_context where key = 'participant_b_id'),
  'join_session reactivates the same membership'
);

select extensions.is(
  (
    select left_at::text
    from public.participants
    where id = (select value::uuid from session_test_context where key = 'participant_b_id')
  ),
  null,
  'reactivated membership clears left_at'
);

select extensions.throws_ok(
  format(
    'select public.start_session(%L::uuid)',
    (select value from session_test_context where key = 'session_id')
  ),
  '42501',
  'facilitator_required',
  'a participant cannot run facilitator mutations'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select extensions.is(
  public.start_session((select value::uuid from session_test_context where key = 'session_id'))->'session'->>'activity_type',
  'estimation',
  'start_session mutation returns explicit estimation activity type'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select extensions.is(
  public.cast_vote(
    (select value::uuid from session_test_context where key = 'session_id'),
    1,
    'm',
    'gold'
  )->>'status',
  'ok',
  'a current-round participant can vote'
);

select extensions.is(
  public.cast_vote(
    (select value::uuid from session_test_context where key = 'session_id'),
    1,
    'm',
    'gold'
  )->>'status',
  'duplicate',
  'duplicate vote submission is explicit and idempotent'
);

select extensions.throws_ok(
  format(
    'select public.cast_vote(%L::uuid, 2, %L, %L)',
    (select value from session_test_context where key = 'session_id'),
    'm',
    'gold'
  ),
  '22023',
  'wrong_round',
  'voting in the wrong round is rejected'
);

select extensions.is(
  public.retract_vote(
    (select value::uuid from session_test_context where key = 'session_id'),
    1
  )->>'status',
  'ok',
  'a participant can retract once before reveal'
);

select public.cast_vote(
  (select value::uuid from session_test_context where key = 'session_id'),
  1,
  'm',
  'gold'
);

select extensions.throws_ok(
  format(
    'select public.retract_vote(%L::uuid, 1)',
    (select value from session_test_context where key = 'session_id')
  ),
  null,
  'reestimate_unavailable',
  'a second retraction in the round is rejected'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select extensions.is(
  public.reveal_votes((select value::uuid from session_test_context where key = 'session_id'))->'session'->>'activity_type',
  'estimation',
  'reveal_votes mutation returns explicit estimation activity type'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select extensions.throws_ok(
  format(
    'select public.cast_vote(%L::uuid, 1, %L, %L)',
    (select value from session_test_context where key = 'session_id'),
    'l',
    'silver'
  ),
  null,
  'voting_closed',
  'voting after reveal is rejected'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
insert into session_test_context (key, value)
select 'second_session_id', public.create_session(
  '20000000-0000-0000-0000-000000000002',
  'Other facilitator'
)->'session'->>'id';

select extensions.throws_ok(
  format(
    'insert into public.votes (session_id, participant_id, round, size, value) values (%L::uuid, %L::uuid, 2, %L, %L)',
    (select value from session_test_context where key = 'second_session_id'),
    (select value from session_test_context where key = 'participant_a_id'),
    's',
    'bronze'
  ),
  '23503',
  null,
  'a vote participant must belong to the same session'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select extensions.is(
  public.next_round((select value::uuid from session_test_context where key = 'session_id'))->'session'->>'activity_type',
  'estimation',
  'next_round mutation returns explicit estimation activity type'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select public.cast_vote(
  (select value::uuid from session_test_context where key = 'session_id'),
  2,
  's',
  'silver'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select public.cast_vote(
  (select value::uuid from session_test_context where key = 'session_id'),
  2,
  'l',
  'bronze'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select extensions.is(
  jsonb_array_length(public.get_round_vote_statuses(
    (select value::uuid from session_test_context where key = 'session_id'),
    2
  ))::text,
  '2',
  'facilitator gets anonymized vote statuses before reveal'
);

select extensions.ok(
  not (public.get_round_vote_statuses(
    (select value::uuid from session_test_context where key = 'session_id'),
    2
  )::text ~ 'gold|silver|bronze|"size"|"value"'),
  'vote status RPC never exposes vote values'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select public.leave_session((select value::uuid from session_test_context where key = 'session_id'));

select extensions.is(
  (
    select count(*)::text
    from public.round_participants
    where session_id = (select value::uuid from session_test_context where key = 'session_id')
      and round = 2
      and participant_id = (select value::uuid from session_test_context where key = 'participant_b_id')
  ),
  '1',
  'leaving after a vote preserves authoritative round participation'
);

select extensions.throws_ok(
  format(
    'select public.cast_vote(%L::uuid, 2, %L, %L)',
    (select value from session_test_context where key = 'session_id'),
    'm',
    'gold'
  ),
  '42501',
  'session_not_available',
  'cast_vote requires active membership'
);

select extensions.ok(
  exists (
    select 1 from pg_constraint
     where conname = 'votes_session_participant_fkey'
       and not convalidated
  ),
  'cross-session vote FK remains NOT VALID during additive cutover'
);

select extensions.ok(
  exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'sessions_one_active_facilitator_uidx'
  ),
  'active facilitator session quota is enforced by a partial unique index'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.sessions', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.participants', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.votes', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.sessions', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.participants', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.votes', 'INSERT,UPDATE,DELETE'),
  'additive cutover revokes all legacy direct table mutations'
);

select extensions.ok(
  has_function_privilege('authenticated', 'public.create_session(uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.join_session(text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.restore_session(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.claim_round(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.cast_vote(uuid,integer,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.retract_vote(uuid,integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.start_session(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.reveal_votes(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.next_round(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.end_session(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.leave_session(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_round_vote_statuses(uuid,integer)', 'EXECUTE'),
  'authenticated role can execute every additive session RPC'
);

select extensions.is(
  (select relreplident::text from pg_class where oid = 'public.votes'::regclass),
  'd',
  'votes uses DEFAULT replica identity and DELETE cannot carry full old rows'
);

select extensions.throws_ok(
  format(
    'select public.claim_round(%L::uuid)',
    (select value from session_test_context where key = 'session_id')
  ),
  '42501',
  'session_not_available',
  'claim_round requires active membership'
);

-- Privileged fixture keeps the common RPC test independent of health creation.
reset role;
insert into public.sessions (
  id, status, current_round, join_code, votes_revealed, started,
  consensus_streak, facilitator_user_id, create_request_id, activity_type
) values (
  '50000000-0000-0000-0000-000000000001', 'active', 1, 'HLTH', false, false,
  0, '10000000-0000-0000-0000-000000000005',
  '50000000-0000-0000-0000-000000000002', 'health_check'
);
insert into public.participants (id, session_id, name, role, user_id)
values
  ('50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'Health Fac', 'facilitator', '10000000-0000-0000-0000-000000000005');
insert into public.health_check_sessions (
  room_id, delivery_id, template_version, squad_name, measurement_date, expires_at
) values (
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000004',
  'squad-health-v1', 'Health fixture', current_date,
  statement_timestamp() + interval '23 hours 55 minutes'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into session_test_context (key, value)
select 'health_join_result', public.join_session('HLTH', 'Health Member rejoined')::text;
reset role;

select extensions.is(
  (
    select count(*)::text from public.participants
     where session_id = '50000000-0000-0000-0000-000000000001'
       and user_id = '10000000-0000-0000-0000-000000000006'
       and role = 'participant'
  ),
  '0',
  'common join_session never inserts a member into a health room'
);

select extensions.is(
  (select value::jsonb->>'status' from session_test_context where key = 'health_join_result'),
  'session_not_found',
  'common join_session hides health rooms behind the server gate'
);

select extensions.ok(
  not ((select value::jsonb from session_test_context where key = 'health_join_result') ? 'session'),
  'denied common health join returns no room metadata'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
insert into session_test_context (key, value)
select 'health_restore_result', public.restore_session('50000000-0000-0000-0000-000000000001')::text;
reset role;

select extensions.is(
  (select value::jsonb->'session'->>'activity_type' from session_test_context where key = 'health_restore_result'),
  null,
  'restore_session returns no health room without gated membership'
);

select extensions.ok(
  (select value::jsonb->>'status' from session_test_context where key = 'health_restore_result') = 'membership_missing',
  'health restore fails closed without service-created membership'
);

insert into public.sessions (
  id, join_code, status, current_round, facilitator_user_id, activity_type
) values (
  '50000000-0000-0000-0000-000000000010', 'DONE', 'completed', 1,
  '10000000-0000-0000-0000-000000000004', 'estimation'
);
insert into public.participants (id, session_id, name, role, user_id)
values (
  '50000000-0000-0000-0000-000000000011',
  '50000000-0000-0000-0000-000000000010',
  'Completed estimation owner', 'facilitator',
  '10000000-0000-0000-0000-000000000004'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select extensions.is(
  public.restore_session('50000000-0000-0000-0000-000000000010')->>'status',
  'session_completed',
  'completed estimation restore retains the common session_completed behavior'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select extensions.is(
  public.leave_session('50000000-0000-0000-0000-000000000001')->>'status',
  'membership_missing',
  'leave_session reveals no ungated health membership'
);

select extensions.is(
  public.join_session('HLTH', 'Health Member returned')->>'status',
  'session_not_found',
  'common join remains closed on repeated health attempts'
);
reset role;

set local role service_role;
select public.join_health_check_room(
  '10000000-0000-0000-0000-000000000006', 'HLTH', 'Health Member'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select extensions.throws_ok(
  $$select public.claim_round('50000000-0000-0000-0000-000000000001')$$,
  '22023', 'wrong_activity_type',
  'claim_round rejects a health room after membership authorization'
);
select extensions.throws_ok(
  $$select public.cast_vote('50000000-0000-0000-0000-000000000001', 1, 'm', 'gold')$$,
  '22023', 'wrong_activity_type',
  'cast_vote rejects a health room after membership authorization'
);
select extensions.throws_ok(
  $$select public.retract_vote('50000000-0000-0000-0000-000000000001', 1)$$,
  '22023', 'wrong_activity_type',
  'retract_vote rejects a health room after membership authorization'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select extensions.throws_ok(
  $$select public.create_session('50000000-0000-0000-0000-000000000002', 'Health Fac')$$,
  '22023', 'wrong_activity_type',
  'create_session rejects an idempotent active health room'
);
select extensions.throws_ok(
  $$select public.create_session(null, 'Health Fac')$$,
  '22023', 'wrong_activity_type',
  'create_session checks active room activity before request id validation'
);
select extensions.throws_ok(
  $$select public.create_session('50000000-0000-0000-0000-000000000099', '')$$,
  '22023', 'wrong_activity_type',
  'create_session checks active room activity before name validation'
);
select extensions.throws_ok(
  $$select public.start_session('50000000-0000-0000-0000-000000000001')$$,
  '22023', 'wrong_activity_type',
  'start_session rejects a health room after facilitator authorization'
);
select extensions.throws_ok(
  $$select public.reveal_votes('50000000-0000-0000-0000-000000000001')$$,
  '22023', 'wrong_activity_type',
  'reveal_votes rejects a health room after facilitator authorization'
);
select extensions.throws_ok(
  $$select public.next_round('50000000-0000-0000-0000-000000000001')$$,
  '22023', 'wrong_activity_type',
  'next_round rejects a health room after facilitator authorization'
);
select extensions.throws_ok(
  $$select public.end_session('50000000-0000-0000-0000-000000000001')$$,
  '22023', 'wrong_activity_type',
  'end_session rejects a health room after facilitator authorization'
);
select extensions.throws_ok(
  $$select public.get_round_vote_statuses('50000000-0000-0000-0000-000000000001', 1)$$,
  '22023', 'wrong_activity_type',
  'get_round_vote_statuses rejects a health room after facilitator authorization'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select extensions.throws_ok(
  $$select public.claim_round('50000000-0000-0000-0000-000000000001')$$,
  '42501', 'session_not_available',
  'claim_round authorizes before exposing health activity type'
);
select extensions.throws_ok(
  $$select public.start_session('50000000-0000-0000-0000-000000000001')$$,
  '42501', 'facilitator_required',
  'facilitator mutation authorizes before exposing health activity type'
);

select extensions.ok(
  exists (
    select 1 from public.sessions
     where id = '50000000-0000-0000-0000-000000000001'
       and status = 'active'
       and current_round = 1
       and not started
       and not votes_revealed
       and consensus_streak = 0
  ),
  'rejected estimation RPCs do not mutate health session lifecycle fields'
);

select extensions.ok(
  not exists (
    select 1 from public.round_participants
     where session_id = '50000000-0000-0000-0000-000000000001'
  )
  and not exists (
    select 1 from public.votes
     where session_id = '50000000-0000-0000-0000-000000000001'
  ),
  'rejected estimation RPCs do not create health votes or round participation'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select extensions.is(
  public.end_session((select value::uuid from session_test_context where key = 'second_session_id'))->'session'->>'activity_type',
  'estimation',
  'end_session mutation returns explicit estimation activity type'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select public.reveal_votes((select value::uuid from session_test_context where key = 'session_id'));
select public.next_round((select value::uuid from session_test_context where key = 'session_id'));

select extensions.is(
  (
    select count(*)::text
    from public.round_participants
    where session_id = (select value::uuid from session_test_context where key = 'session_id')
      and round = 3
      and participant_id = (select value::uuid from session_test_context where key = 'participant_b_id')
  ),
  '0',
  'next_round excludes inactive memberships'
);

select * from extensions.finish();
rollback;
