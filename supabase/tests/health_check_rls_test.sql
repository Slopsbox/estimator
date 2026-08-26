-- `supabase test db --local supabase/tests/health_check_rls_test.sql`
-- Requires all migrations through anonymous_health_check_core.
begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(37);

insert into auth.users (id, aud, role, created_at, updated_at)
values
  ('65000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', now(), now()),
  ('65000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', now(), now());

create temporary table health_rls_context (key text primary key, value text not null);
grant select on health_rls_context to authenticated;
grant all on health_rls_context to service_role;

set local role service_role;
insert into health_rls_context (key, value)
select 'create_result', public.create_health_check_room(
  '65000000-0000-0000-0000-000000000001',
  '65000000-0000-0000-0000-000000000011', 'RLS Fac', 'RLS Squad', current_date,
  '65000000-0000-0000-0000-000000000012'
)::text;
insert into health_rls_context
select 'room_id', value::jsonb->'session'->>'id' from health_rls_context where key = 'create_result';
insert into health_rls_context
select 'join_code', value::jsonb->'session'->>'join_code' from health_rls_context where key = 'create_result';
select public.join_health_check_room(
  '65000000-0000-0000-0000-000000000002',
  (select value from health_rls_context where key = 'join_code'), 'RLS Member'
);
reset role;

select extensions.ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.health_check_templates'::regclass,
    'public.health_check_areas'::regclass,
    'public.health_check_questions'::regclass,
    'public.health_check_sessions'::regclass,
    'public.health_check_respondents'::regclass,
    'public.health_check_question_aggregates'::regclass,
    'public.health_check_report_jobs'::regclass
  )),
  'RLS is enabled on every health-check table'
);
select extensions.ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.sessions'::regclass,
    'public.participants'::regclass
  )),
  'RLS remains enabled on sessions and participants'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.health_check_templates', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.health_check_areas', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.health_check_questions', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.health_check_sessions', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.health_check_respondents', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.health_check_question_aggregates', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.health_check_report_jobs', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon has no direct health table privileges'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.health_check_templates', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.health_check_areas', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.health_check_questions', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.health_check_sessions', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.health_check_respondents', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.health_check_question_aggregates', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.health_check_report_jobs', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated has no direct health table privileges'
);
select extensions.ok(
  not has_table_privilege('service_role', 'public.health_check_report_jobs', 'SELECT')
  and has_column_privilege('service_role', 'public.health_check_report_jobs', 'id', 'SELECT')
  and has_column_privilege('service_role', 'public.health_check_report_jobs', 'status', 'SELECT')
  and not has_column_privilege('service_role', 'public.health_check_report_jobs', 'facilitator_user_id', 'SELECT')
  and not has_column_privilege('service_role', 'public.health_check_report_jobs', 'encrypted_package', 'SELECT')
  and not has_column_privilege('service_role', 'public.health_check_report_jobs', 'package_nonce', 'SELECT')
  and not has_table_privilege('service_role', 'public.health_check_report_jobs', 'UPDATE')
  and not has_table_privilege('service_role', 'public.health_check_report_jobs', 'DELETE')
  and not has_table_privilege('service_role', 'public.health_check_report_jobs', 'INSERT')
  and not has_table_privilege('service_role', 'public.health_check_report_jobs', 'TRUNCATE')
  and not has_table_privilege('service_role', 'public.health_check_report_jobs', 'REFERENCES')
  and not has_table_privilege('service_role', 'public.health_check_report_jobs', 'TRIGGER'),
  'service_role reads only queue metadata directly; package and writes require private RPCs'
);
select extensions.ok(
  not exists (
    select 1
      from information_schema.role_table_grants
     where grantee = 'service_role'
       and table_schema = 'public'
       and table_name in (
         'health_check_templates', 'health_check_areas', 'health_check_questions',
          'health_check_sessions', 'health_check_question_aggregates'
       )
  )
  and not has_any_column_privilege(
    'service_role', 'public.health_check_templates',
    'SELECT,INSERT,UPDATE,REFERENCES'
  )
  and not has_any_column_privilege(
    'service_role', 'public.health_check_areas',
    'SELECT,INSERT,UPDATE,REFERENCES'
  )
  and not has_any_column_privilege(
    'service_role', 'public.health_check_questions',
    'SELECT,INSERT,UPDATE,REFERENCES'
  )
  and not has_any_column_privilege(
    'service_role', 'public.health_check_sessions',
    'SELECT,INSERT,UPDATE,REFERENCES'
  )
  and not has_any_column_privilege(
    'service_role', 'public.health_check_question_aggregates',
    'SELECT,INSERT,UPDATE,REFERENCES'
  )
  and not has_table_privilege(
    'service_role', 'public.health_check_respondents',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  )
  and not has_any_column_privilege(
    'service_role', 'public.health_check_respondents',
    'SELECT,INSERT,UPDATE,REFERENCES'
  ),
  'service_role has no direct report source or respondent table access'
);

select extensions.ok(
  has_function_privilege('service_role', 'public.create_health_check_room(uuid,uuid,text,text,date,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.create_health_check_room(uuid,uuid,text,text,date,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.create_health_check_room(uuid,uuid,text,text,date,uuid)', 'EXECUTE'),
  'health room creation is executable only by service_role among API roles'
);
select extensions.ok(
  has_function_privilege('service_role', 'public.join_health_check_room(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.join_health_check_room(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.join_health_check_room(uuid,text,text)', 'EXECUTE'),
  'health room join is executable only by service_role among API roles'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.get_health_check_state(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.start_health_check(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.submit_health_check(uuid,smallint[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_health_check_progress(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.remove_health_check_respondent(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.abort_health_check(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.finalize_health_check(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_health_check_download_status(uuid)', 'EXECUTE'),
  'authenticated receives only the expected health domain RPCs'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.get_health_check_state(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.start_health_check(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.submit_health_check(uuid,smallint[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_health_check_progress(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.remove_health_check_respondent(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.abort_health_check(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.finalize_health_check(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_health_check_download_status(uuid)', 'EXECUTE'),
  'anon cannot execute health domain RPCs'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.get_health_check_state(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.create_health_check_room(uuid,uuid,text,text,date,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.cleanup_expired_health_checks()', 'EXECUTE'),
  'PUBLIC receives no implicit SECURITY DEFINER execution'
);
select extensions.ok(
  has_function_privilege('service_role', 'private.cleanup_expired_health_checks()', 'EXECUTE')
  and has_function_privilege('service_role', 'private.claim_health_check_report_job(uuid,text,interval)', 'EXECUTE')
  and has_function_privilege('service_role', 'private.fail_health_check_report_job(uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'private.materialize_health_check_download(uuid,text,bytea,bytea,integer,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'private.get_health_check_download_package(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.cleanup_expired_health_checks()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.claim_health_check_report_job(uuid,text,interval)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.fail_health_check_report_job(uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.materialize_health_check_download(uuid,text,bytea,bytea,integer,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.get_health_check_download_package(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.cleanup_expired_health_checks()', 'EXECUTE'),
  'package and cleanup functions are private and service-role only'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.get_health_check_download_package_for_service(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.get_health_check_download_package_for_service(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.get_health_check_download_package_for_service(uuid,uuid)',
    'EXECUTE'
  ),
  'public package wrapper is executable only by service_role'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.get_health_check_report_snapshot_for_service(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.get_health_check_report_snapshot_for_service(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.get_health_check_report_snapshot_for_service(uuid,text)',
    'EXECUTE'
  ),
  'public report snapshot wrapper is executable only by service_role'
);
select extensions.ok(
  (select not exists (
      select 1
        from pg_class as c
       where c.oid = any (array[
         'public.health_check_report_jobs'::regclass::oid,
         'public.health_check_sessions'::regclass::oid,
         'public.sessions'::regclass::oid,
         'public.health_check_templates'::regclass::oid,
         'public.health_check_areas'::regclass::oid,
         'public.health_check_questions'::regclass::oid,
         'public.health_check_question_aggregates'::regclass::oid
       ]::oid[])
         and c.relowner <> p.proowner
    )
     from pg_proc as p
    where p.oid = 'public.get_health_check_report_snapshot_for_service(uuid,text)'::regprocedure),
  'report snapshot owner also owns every source table it must read'
);
select extensions.ok(
  (select count(*) = 7
          and bool_and(c.relrowsecurity and not c.relforcerowsecurity)
     from pg_class as c
    where c.oid = any (array[
      'public.health_check_report_jobs'::regclass::oid,
      'public.health_check_sessions'::regclass::oid,
      'public.health_check_respondents'::regclass::oid,
      'public.health_check_question_aggregates'::regclass::oid,
      'public.health_check_templates'::regclass::oid,
      'public.health_check_areas'::regclass::oid,
      'public.health_check_questions'::regclass::oid
    ]::oid[])),
  'health tables use enabled non-forced RLS for owner-bound security definer access'
);
select extensions.ok(
  (select position('health_check_respondents' in lower(p.prosrc)) = 0
          and position('health_check_question_aggregates' in lower(p.prosrc)) > 0
     from pg_proc as p
    where p.oid = 'public.get_health_check_report_snapshot_for_service(uuid,text)'::regprocedure),
  'report snapshot derives cohort size from aggregates and never reads respondents'
);

select extensions.is(
  (select count(*)::text from pg_policies where schemaname = 'public' and tablename like 'health_check_%'),
  '0',
  'no health table policy accidentally exposes rows'
);
select extensions.ok(
  (select bool_and(prosecdef and proconfig @> array['search_path=pg_catalog'])
   from pg_proc where oid in (
       'public.create_health_check_room(uuid,uuid,text,text,date,uuid)'::regprocedure,
      'public.join_health_check_room(uuid,text,text)'::regprocedure,
     'public.get_health_check_state(uuid)'::regprocedure,
     'public.start_health_check(uuid)'::regprocedure,
     'public.submit_health_check(uuid,smallint[])'::regprocedure,
     'public.get_health_check_progress(uuid)'::regprocedure,
     'public.remove_health_check_respondent(uuid,uuid)'::regprocedure,
     'public.abort_health_check(uuid)'::regprocedure,
     'public.finalize_health_check(uuid)'::regprocedure,
      'public.get_health_check_download_status(uuid)'::regprocedure,
      'private.materialize_health_check_download(uuid,text,bytea,bytea,integer,text)'::regprocedure,
      'private.claim_health_check_report_job(uuid,text,interval)'::regprocedure,
      'private.fail_health_check_report_job(uuid,text)'::regprocedure,
       'private.get_health_check_download_package(uuid,uuid)'::regprocedure,
       'public.get_health_check_download_package_for_service(uuid,uuid)'::regprocedure,
       'public.get_health_check_report_snapshot_for_service(uuid,text)'::regprocedure,
      'private.cleanup_expired_health_checks()'::regprocedure
   )),
  'all health RPCs are security definer with fixed pg_catalog search path'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.health_check_question_aggregates', 'SELECT')
  and not has_table_privilege('authenticated', 'public.health_check_report_jobs', 'SELECT'),
  'facilitator role cannot directly read aggregates or jobs'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.health_check_respondents', 'SELECT')
  and has_function_privilege('authenticated', 'public.get_health_check_progress(uuid)', 'EXECUTE'),
  'member roster state is available only through the safe progress RPC'
);
select extensions.ok(
  has_schema_privilege('service_role', 'private', 'USAGE')
  and to_regclass('private.private_schema_privilege_state') is not null
  and exists (
    select 1 from private.private_schema_privilege_state
     where release_name = 'enforce_session_rls_after_frontend'
  )
  and to_regclass('private.health_check_installation_metadata') is null,
  'lockdown owns exact private schema privilege state and health creates no rollback metadata'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'private.prevent_health_catalog_mutation()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.validate_health_check_expiry()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.validate_health_check_room_type()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.prevent_health_check_room_type_change()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.validate_health_report_job_state()', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.validate_health_report_job_state()', 'EXECUTE'),
  'internal trigger helpers are not client executable'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.join_session(text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.leave_session(uuid)', 'EXECUTE'),
  'common membership RPC grants remain intact after full replacement'
);
select extensions.ok(
  not exists (
    select 1 from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated')
      and table_schema = 'public'
      and table_name like 'health_check_%'
  ),
  'information schema confirms no direct client grants on health tables'
);
select extensions.ok(
  (
    select count(*)
      from pg_policies
     where schemaname = 'public' and tablename = 'sessions'
       and cmd = 'SELECT' and permissive = 'PERMISSIVE'
       and roles = array['authenticated'::name]
       and regexp_replace(coalesce(qual, ''), '\s+', '', 'g') = any (array[
         '(SELECTprivate.is_session_member(sessions.id)ASis_session_member)',
         '(SELECTprivate.is_session_member(id)ASis_session_member)'
       ])
  ) = 1
  and (
    select count(*)
      from pg_policies
     where schemaname = 'public' and tablename = 'participants'
       and cmd = 'SELECT' and permissive = 'PERMISSIVE'
       and roles = array['authenticated'::name]
       and regexp_replace(coalesce(qual, ''), '\s+', '', 'g') = any (array[
         '(SELECTprivate.is_session_member(participants.session_id)ASis_session_member)',
         '(SELECTprivate.is_session_member(session_id)ASis_session_member)'
       ])
  ) = 1
  and (
    select count(*) from pg_policies
     where schemaname = 'public'
       and tablename in ('sessions', 'participants')
       and cmd = 'SELECT'
  ) = 2,
  'sessions and participants have exactly the expected authenticated member SELECT expressions'
);
select extensions.ok(
  not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('sessions', 'participants')
       and cmd <> 'SELECT'
  ),
  'sessions and participants have no client-role DML policies'
);
select extensions.ok(
  not exists (
    select 1
      from unnest(array['sessions', 'participants']) as tables(table_name)
      cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privileges(privilege)
     where has_table_privilege('anon', format('public.%I', tables.table_name), privileges.privilege)
  )
  and not exists (
    select 1
      from unnest(array['sessions', 'participants']) as tables(table_name)
      join pg_class c on c.relname = tables.table_name
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as privileges(privilege)
     where has_column_privilege('anon', c.oid, a.attnum, privileges.privilege)
  )
  and not exists (
    select 1
      from unnest(array['sessions', 'participants']) as tables(table_name)
      cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privileges(privilege)
     where has_table_privilege('authenticated', format('public.%I', tables.table_name), privileges.privilege)
  )
  and not exists (
    select 1
      from unnest(array['sessions', 'participants']) as tables(table_name)
      join pg_class c on c.relname = tables.table_name
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      cross join unnest(array['INSERT', 'UPDATE', 'REFERENCES']) as privileges(privilege)
     where has_column_privilege('authenticated', c.oid, a.attnum, privileges.privilege)
  )
  and not has_table_privilege('authenticated', 'public.sessions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.participants', 'SELECT')
  and not exists (
    select 1 from pg_attribute a
     where a.attrelid = 'public.sessions'::regclass
       and a.attnum > 0 and not a.attisdropped
       and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
           is distinct from (a.attname = any (array[
             'id', 'activity_type', 'consensus_streak', 'created_at',
             'current_round', 'join_code', 'started', 'status', 'votes_revealed'
           ]))
  )
  and not exists (
    select 1 from pg_attribute a
     where a.attrelid = 'public.participants'::regclass
       and a.attnum > 0 and not a.attisdropped
       and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
           is distinct from (a.attname = any (array[
             'id', 'joined_at', 'left_at', 'name', 'role', 'session_id'
           ]))
  ),
  'room grants expose only the expected authenticated public SELECT columns and no client writes'
);

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select extensions.throws_ok(
  $$select * from public.sessions limit 1$$,
  '42501', null,
  'anon direct session SELECT is denied'
);
select extensions.throws_ok(
  $$select * from public.participants limit 1$$,
  '42501', null,
  'anon direct participant SELECT is denied'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '65000000-0000-0000-0000-000000000002', true);
select extensions.throws_ok(
  $$select * from public.health_check_sessions limit 1$$,
  '42501', null,
  'authenticated direct health session SELECT is denied'
);
select extensions.is(
  (select count(*)::text from public.sessions
    where id = (select value::uuid from health_rls_context where key = 'room_id')),
  '1',
  'active health member can directly read only member-scoped room envelope'
);
select extensions.is(
  (select count(*)::text from public.participants
    where session_id = (select value::uuid from health_rls_context where key = 'room_id')),
  '2',
  'active health member can directly read the member-scoped room roster'
);
select extensions.throws_ok(
  $$select facilitator_user_id, create_request_id from public.sessions limit 1$$,
  '42501', null,
  'authenticated cannot directly select stable facilitator or request identifiers'
);
select extensions.throws_ok(
  $$select user_id from public.participants limit 1$$,
  '42501', null,
  'authenticated cannot directly select participant auth identifiers'
);
reset role;

set local session_replication_role = replica;
update public.health_check_sessions set expires_at = statement_timestamp() - interval '1 minute'
 where room_id = (select value::uuid from health_rls_context where key = 'room_id');
set local session_replication_role = origin;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '65000000-0000-0000-0000-000000000002', true);
select extensions.is(
  (select count(*)::text from public.sessions
    where id = (select value::uuid from health_rls_context where key = 'room_id')),
  '0',
  'expired health room is hidden by member-scoped session RLS'
);
select extensions.is(
  (select count(*)::text from public.participants
    where session_id = (select value::uuid from health_rls_context where key = 'room_id')),
  '0',
  'expired health roster is hidden by member-scoped participant RLS'
);
reset role;

select * from extensions.finish();
rollback;
