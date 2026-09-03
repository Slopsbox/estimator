-- Run only after the additive migration and
-- `supabase/releases/enforce_session_rls_after_frontend.sql` are applied.
-- `supabase test db supabase/tests/session_rls_test.sql`
begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(17);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'facilitator-rls@test.invalid', now(), now()),
  ('30000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'participant-a-rls@test.invalid', now(), now()),
  ('30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'participant-b-rls@test.invalid', now(), now()),
  ('30000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'outsider-rls@test.invalid', now(), now());

insert into private.turnstile_attestations (user_id, verified_until)
select id, clock_timestamp() + interval '15 minutes' from auth.users
where id between '30000000-0000-0000-0000-000000000001'::uuid
             and '30000000-0000-0000-0000-000000000004'::uuid;

create temporary table session_rls_context (key text primary key, value text not null);
grant select on session_rls_context to authenticated;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
insert into session_rls_context values (
  'create_result',
  public.create_session('40000000-0000-0000-0000-000000000001', 'Facilitator')::text
);
insert into session_rls_context
select 'session_id', value::jsonb->'session'->>'id' from session_rls_context where key = 'create_result';
insert into session_rls_context
select 'join_code', value::jsonb->'session'->>'join_code' from session_rls_context where key = 'create_result';

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
insert into session_rls_context
select 'participant_a_id', public.join_session(
  (select value from session_rls_context where key = 'join_code'), 'A'
)->'participant'->>'id';

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
insert into session_rls_context
select 'participant_b_id', public.join_session(
  (select value from session_rls_context where key = 'join_code'), 'B'
)->'participant'->>'id';

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select public.start_session((select value::uuid from session_rls_context where key = 'session_id'));

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select public.cast_vote((select value::uuid from session_rls_context where key = 'session_id'), 1, 'm', 'gold');
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select public.cast_vote((select value::uuid from session_rls_context where key = 'session_id'), 1, 'l', 'silver');

select extensions.ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.sessions'::regclass,
    'public.participants'::regclass,
    'public.votes'::regclass,
    'public.round_participants'::regclass
  )),
  'RLS is enabled on all exposed session tables'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.sessions', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.participants', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.votes', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.round_participants', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon has no direct table access after lockdown'
);
select extensions.ok(
  has_column_privilege('authenticated', 'public.sessions', 'id', 'SELECT')
  and has_column_privilege('authenticated', 'public.sessions', 'activity_type', 'SELECT')
  and has_column_privilege('authenticated', 'public.sessions', 'status', 'SELECT')
  and not has_column_privilege('authenticated', 'public.sessions', 'facilitator_user_id', 'SELECT')
  and not has_column_privilege('authenticated', 'public.sessions', 'create_request_id', 'SELECT')
  and has_column_privilege('authenticated', 'public.participants', 'id', 'SELECT')
  and has_column_privilege('authenticated', 'public.participants', 'name', 'SELECT')
  and not has_column_privilege('authenticated', 'public.participants', 'user_id', 'SELECT')
  and has_table_privilege('authenticated', 'public.votes', 'SELECT')
  and has_table_privilege('authenticated', 'public.round_participants', 'SELECT'),
  'authenticated can read public fields but not stable auth identifiers'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.sessions', 'INSERT,UPDATE,DELETE')
  and not has_column_privilege('authenticated', 'public.sessions', 'activity_type', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.participants', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.votes', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.round_participants', 'INSERT,UPDATE,DELETE'),
  'authenticated mutations remain RPC-only'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.throws_ok(
  format(
    'update public.sessions set activity_type = %L where id = %L::uuid',
    'health_check',
    (select value from session_rls_context where key = 'session_id')
  ),
  '42501',
  null,
  'authenticated members cannot write activity_type'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.is(
  private.can_access_presence_topic('session:' || (select value from session_rls_context where key = 'session_id')),
  false,
  'an outsider cannot join a private session presence topic'
);
select extensions.is(
  private.can_access_presence_topic('session:' || (select value from session_rls_context where key = 'session_id') || ':votes:1'),
  false,
  'an outsider cannot join a private session subtopic'
);
select extensions.is(
  (select count(*)::text from public.sessions where id = (select value::uuid from session_rls_context where key = 'session_id')),
  '0',
  'an outsider cannot read another session'
);
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select extensions.is(
  (select activity_type from public.sessions where id = (select value::uuid from session_rls_context where key = 'session_id')),
  'estimation',
  'an active member can read the room activity type'
);
select extensions.is(
  private.can_access_presence_topic('session:' || (select value from session_rls_context where key = 'session_id')),
  true,
  'an active member can join the private session presence topic'
);
select extensions.is(
  private.can_access_presence_topic('session:' || (select value from session_rls_context where key = 'session_id') || ':votes:1'),
  true,
  'an active member can join a private session subtopic'
);
select extensions.is(
  (select count(*)::text from public.sessions where id = (select value::uuid from session_rls_context where key = 'session_id')),
  '1',
  'an active member can read their session'
);
select extensions.is(
  (select count(*)::text from public.votes where session_id = (select value::uuid from session_rls_context where key = 'session_id')),
  '1',
  'before reveal a participant reads only their own vote'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select count(*)::text from public.votes where session_id = (select value::uuid from session_rls_context where key = 'session_id')),
  '0',
  'before reveal the facilitator cannot read vote values'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select extensions.ok(
  not has_column_privilege('anon', 'public.sessions', 'activity_type', 'SELECT'),
  'anon has no privilege to read room activity types'
);
reset role;

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.reveal_votes((select value::uuid from session_rls_context where key = 'session_id'));
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select count(*)::text from public.votes where session_id = (select value::uuid from session_rls_context where key = 'session_id')),
  '2',
  'after reveal the facilitator can read all round votes'
);
select extensions.is(
  (select count(*)::text from public.round_participants where session_id = (select value::uuid from session_rls_context where key = 'session_id')),
  '3',
  'members can read the authoritative round roster'
);

select * from extensions.finish();
rollback;
