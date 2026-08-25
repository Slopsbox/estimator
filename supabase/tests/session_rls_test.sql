-- Run only after the additive migration and
-- `supabase/releases/enforce_session_rls_after_frontend.sql` are applied.
-- `supabase test db supabase/tests/session_rls_test.sql`
begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(10);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'facilitator-rls@test.invalid', now(), now()),
  ('30000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'participant-a-rls@test.invalid', now(), now()),
  ('30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'participant-b-rls@test.invalid', now(), now()),
  ('30000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'outsider-rls@test.invalid', now(), now());

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
  has_table_privilege('authenticated', 'public.sessions', 'SELECT')
  and has_table_privilege('authenticated', 'public.participants', 'SELECT')
  and has_table_privilege('authenticated', 'public.votes', 'SELECT')
  and has_table_privilege('authenticated', 'public.round_participants', 'SELECT'),
  'authenticated has the required SELECT grants'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.sessions', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.participants', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.votes', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.round_participants', 'INSERT,UPDATE,DELETE'),
  'authenticated mutations remain RPC-only'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.is(
  (select count(*)::text from public.sessions where id = (select value::uuid from session_rls_context where key = 'session_id')),
  '0',
  'an outsider cannot read another session'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
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
