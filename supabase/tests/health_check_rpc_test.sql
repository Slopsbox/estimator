-- `supabase test db --local supabase/tests/health_check_rpc_test.sql`
-- Requires all migrations through anonymous_health_check_core.
begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(136);

insert into auth.users (id, aud, role, created_at, updated_at)
values
  ('61000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', now(), now()),
  ('61000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', now(), now()),
  ('61000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', now(), now()),
  ('61000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', now(), now()),
  ('61000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', now(), now()),
  ('61000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', now(), now()),
  ('61000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', now(), now()),
  ('61000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', now(), now()),
  ('61000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', now(), now()),
  ('61000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', now(), now());

create temporary table health_test_context (key text primary key, value text not null);
grant all on health_test_context to service_role, authenticated;

create temporary table health_report_snapshot (
  line_number bigint generated always as identity,
  job_id uuid,
  aad_room_id uuid,
  squad_name text,
  measurement_date date,
  template_version text,
  expected_respondent_count integer,
  area_key text,
  area_sequence smallint,
  area_title text,
  area_introduction text,
  area_description text,
  question_key text,
  question_sequence smallint,
  question_text text,
  score_sum bigint,
  response_count integer
);
grant all on health_report_snapshot to service_role;
grant usage, select on sequence health_report_snapshot_line_number_seq to service_role;

set local role service_role;
insert into health_test_context (key, value)
select 'create_result', public.create_health_check_room(
  '61000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  '  Ada  ',
  '  Squad Sikker  ',
  date '2026-08-26',
  '63000000-0000-0000-0000-000000000001'
)::text;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.throws_ok(
  $$select public.create_health_check_room(
    '61000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000099',
    'Ada', 'Denied', date '2026-08-26',
    '63000000-0000-0000-0000-000000000099'
  )$$,
  '42501', null,
  'authenticated cannot directly execute service-only room creation'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select extensions.throws_ok(
  $$select public.join_health_check_room(
    '61000000-0000-0000-0000-000000000002', 'NOPE', 'Denied'
  )$$,
  '42501', null,
  'authenticated cannot directly execute service-only health join'
);
reset role;

insert into health_test_context
select 'room_id', value::jsonb->'session'->>'id' from health_test_context where key = 'create_result';
insert into health_test_context
select 'join_code', value::jsonb->'session'->>'join_code' from health_test_context where key = 'create_result';

select extensions.is(
  (select count(*)::text from public.health_check_templates where version = 'squad-health-v1'),
  '1',
  'the immutable v1 template exists'
);
select extensions.results_eq(
  $$select area_count, question_count from public.health_check_templates where version = 'squad-health-v1'$$,
  $$values (7::smallint, 31::smallint)$$,
  'the template declares exactly seven areas and 31 questions'
);
select extensions.is(
  (select count(*)::text from public.health_check_areas where template_version = 'squad-health-v1'),
  '7',
  'the catalog contains exactly seven v1 areas'
);
select extensions.is(
  (select count(*)::text from public.health_check_questions where template_version = 'squad-health-v1'),
  '31',
  'the catalog contains exactly 31 v1 questions'
);
select extensions.results_eq(
  $$select question_key, text from public.health_check_questions where template_version = 'squad-health-v1' and sequence in (1, 12, 31) order by sequence$$,
  $$values
    ('joy_look_forward'::text, 'Jeg gleder meg som regel til arbeidsdagen.'::text),
    ('direction_customer_value'::text, 'Vi ser en tydelig sammenheng mellom arbeidet vårt og verdi for kunder, rådgivere eller Gjensidige.'::text),
    ('learning_use_insight'::text, 'Vi bruker innsikt og data til å utfordre antakelser og forbedre løsningene våre.'::text)$$,
  'representative catalog keys and Norwegian text match template v1 exactly'
);
select extensions.ok(
  not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name in ('health_check_responses', 'health_check_answers')
  ),
  'no raw response or answer table exists'
);
select extensions.ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name in ('health_check_sessions', 'health_check_report_jobs')
       and column_name in (
         'encrypted_facilitator_email', 'email_nonce', 'email_key_version',
         'encrypted_recipient', 'recipient_nonce', 'provider_message_id',
         'encrypted_pdf', 'encrypted_csv'
       )
  ),
  'health schema has no address or separate artifact columns'
);
select extensions.ok(
  to_regprocedure('public.create_health_check_room(uuid,uuid,text,text,date,uuid)') is not null
  and to_regprocedure('public.create_health_check_room(uuid,uuid,text,text,date,uuid,bytea,bytea,integer)') is null,
  'room creation accepts no address or encryption envelope arguments'
);

select extensions.is(
  (select value::jsonb->>'status' from health_test_context where key = 'create_result'),
  'ok',
  'service_role creates a health room atomically'
);
select extensions.ok(
  not ((select value::jsonb from health_test_context where key = 'create_result')::text ~ 'encrypted|nonce|request_id|facilitator_user_id'),
  'creation response excludes encrypted data and stable authorization identifiers'
);
select extensions.is(
  (select squad_name from public.health_check_sessions where room_id = (select value::uuid from health_test_context where key = 'room_id')),
  'Squad Sikker',
  'creation trims and stores validated squad metadata'
);
select extensions.ok(
  (select expires_at <= statement_timestamp() + interval '23 hours 55 minutes'
     from public.health_check_sessions
    where room_id = (select value::uuid from health_test_context where key = 'room_id')),
  'new rooms expire no later than 23 hours 55 minutes after creation'
);
insert into public.sessions (
  id, status, current_round, join_code, votes_revealed, started,
  consensus_streak, facilitator_user_id, create_request_id, activity_type
) values (
  '64000000-0000-0000-0000-000000000001', 'active', 1, 'MAXT', false, false,
  0, '61000000-0000-0000-0000-000000000008',
  '64000000-0000-0000-0000-000000000002', 'health_check'
);
select extensions.throws_ok(
  $$insert into public.health_check_sessions (
      room_id, delivery_id, template_version, squad_name, measurement_date,
       expires_at
    ) values (
      '64000000-0000-0000-0000-000000000001',
      '64000000-0000-0000-0000-000000000003', 'squad-health-v1',
       'Too long', current_date,
      statement_timestamp() + interval '23 hours 55 minutes 1 second'
    )$$,
  '22023', 'invalid_health_check_expiry',
  'health session expiry cannot exceed exactly 23 hours 55 minutes'
);
delete from public.sessions where id = '64000000-0000-0000-0000-000000000001';

set local role service_role;
select extensions.is(
  public.create_health_check_room(
    '61000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000001',
    'Ignored', 'Ignored', date '2026-08-27',
    '63000000-0000-0000-0000-000000000099'
  )->'session'->>'id',
  (select value from health_test_context where key = 'room_id'),
  'same facilitator and request id return the existing room snapshot'
);
select extensions.is(
  public.create_health_check_room(
    '61000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000099',
    'Ada', 'Other squad', date '2026-08-27',
    '63000000-0000-0000-0000-000000000099'
  )->>'status',
  'active_session_exists',
  'a conflicting active facilitator room is explicit and does not weaken the quota'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  format('select public.start_health_check(%L::uuid)', (select value from health_test_context where key = 'room_id')),
  '22023', 'health_check_minimum_participants',
  'start requires at least five active participant memberships'
);

reset role;
set local role service_role;
insert into health_test_context (key, value)
select 'member_join_result', public.join_health_check_room(
  '61000000-0000-0000-0000-000000000002',
  (select value from health_test_context where key = 'join_code'), '  Member 2  '
)::text;
select extensions.ok(
  not ((select value::jsonb from health_test_context where key = 'member_join_result')::text ~ 'user_id|facilitator_user_id|create_request_id')
  and (select value::jsonb->'participant'->>'name' from health_test_context where key = 'member_join_result') = 'Member 2',
  'service health join normalizes the name and strips stable authorization identifiers'
);
select extensions.throws_ok(
  $$select public.join_health_check_room(
    '00000000-0000-0000-0000-000000000001', 'NOPE', 'Unknown'
  )$$,
  '22023', 'invalid_user',
  'service health join verifies the JWT-derived user exists'
);
select extensions.is(
  public.join_health_check_room(
    '61000000-0000-0000-0000-000000000001',
    (select value from health_test_context where key = 'join_code'), 'Fac duplicate'
  )->>'status',
  'role_conflict',
  'service health join prevents facilitator and participant role conflict'
);
do $join_members$
declare
  v_user uuid;
begin
  foreach v_user in array array[
    '61000000-0000-0000-0000-000000000003'::uuid,
    '61000000-0000-0000-0000-000000000004'::uuid,
    '61000000-0000-0000-0000-000000000005'::uuid,
    '61000000-0000-0000-0000-000000000006'::uuid,
    '61000000-0000-0000-0000-000000000007'::uuid
  ] loop
    perform public.join_health_check_room(
      v_user,
      (select value from health_test_context where key = 'join_code'),
      'Member ' || right(v_user::text, 1)
    );
  end loop;
end;
$join_members$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000008', true);
select extensions.is(
  public.join_session((select value from health_test_context where key = 'join_code'), 'Bypass')->>'status',
  'session_not_found',
  'common authenticated join hides a lobby health room'
);

select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select extensions.is(
  public.get_health_check_state((select value::uuid from health_test_context where key = 'room_id'))->>'phase',
  'lobby',
  'active member can retrieve safe lobby state'
);
select extensions.ok(
  not (public.get_health_check_state((select value::uuid from health_test_context where key = 'room_id'))::text ~ 'aggregate|score|user_id'),
  'member state excludes aggregates, scores and auth ids'
);
select extensions.throws_ok(
  format('select public.start_health_check(%L::uuid)', (select value from health_test_context where key = 'room_id')),
  '42501', 'facilitator_required',
  'participant cannot start a health check'
);

select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select extensions.is(
  public.start_health_check((select value::uuid from health_test_context where key = 'room_id'))->>'phase',
  'collecting',
  'facilitator starts and freezes the health check'
);
reset role;
select extensions.is(
  (select count(*)::text from public.health_check_respondents where room_id = (select value::uuid from health_test_context where key = 'room_id')),
  '6',
  'start freezes exactly active participant-role memberships and excludes facilitator'
);
select extensions.is(
  (select count(*)::text from public.health_check_question_aggregates where room_id = (select value::uuid from health_test_context where key = 'room_id')),
  '31',
  'start seeds exactly 31 zero aggregate rows'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000008', true);
reset role;
set local role service_role;
insert into health_test_context (key, value)
select 'late_join_result', public.join_health_check_room(
  '61000000-0000-0000-0000-000000000008',
  (select value from health_test_context where key = 'join_code'), 'Too late'
)::text;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000008', true);
select extensions.is(
  (select value::jsonb->>'status' from health_test_context where key = 'late_join_result'),
  'session_not_found',
  'service join hides collecting health rooms'
);
select extensions.throws_ok(
  format('select public.get_health_check_progress(%L::uuid)', (select value from health_test_context where key = 'room_id')),
  '42501', 'facilitator_required',
  'outsider cannot enumerate health progress'
);

select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
reset role;
insert into health_test_context (key, value)
select 'member_f_id', id::text from public.participants
where session_id = (select value::uuid from health_test_context where key = 'room_id')
  and user_id = '61000000-0000-0000-0000-000000000007';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select extensions.is(
  public.remove_health_check_respondent(
    (select value::uuid from health_test_context where key = 'room_id'),
    (select value::uuid from health_test_context where key = 'member_f_id')
  )->>'status',
  'removed',
  'facilitator can remove an in-progress respondent under the room lock'
);
reset role;
select extensions.is(
  (select count(*)::text from public.health_check_respondents where room_id = (select value::uuid from health_test_context where key = 'room_id')),
  '5',
  'removal changes the frozen cohort without touching aggregates'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select extensions.throws_ok(
  format('select public.submit_health_check(%L::uuid, array_fill(4::smallint, array[30]))', (select value from health_test_context where key = 'room_id')),
  '22023', 'invalid_health_check_scores',
  'submit rejects arrays that do not contain exactly 31 scores'
);
select extensions.throws_ok(
  format('select public.submit_health_check(%L::uuid, array_fill(8::smallint, array[31]))', (select value from health_test_context where key = 'room_id')),
  '22023', 'invalid_health_check_scores',
  'submit rejects scores outside one through seven'
);
reset role;
select extensions.is(
  (select sum(score_sum)::text || ':' || sum(response_count)::text from public.health_check_question_aggregates where room_id = (select value::uuid from health_test_context where key = 'room_id')),
  '0:0',
  'malformed submissions leave every aggregate unchanged atomically'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select extensions.is(
  public.submit_health_check(
    (select value::uuid from health_test_context where key = 'room_id'),
    array(select (((i - 1) % 7) + 1)::smallint from generate_series(1, 31) i)
  )->>'status',
  'completed',
  'valid submit returns only completed status'
);
reset role;
select extensions.results_eq(
  format('select q.sequence, a.score_sum from public.health_check_question_aggregates a join public.health_check_questions q using (template_version, question_key) where a.room_id = %L::uuid and q.sequence in (1, 7, 8, 31) order by q.sequence', (select value from health_test_context where key = 'room_id')),
  $$values (1::smallint, 1::bigint), (7::smallint, 7::bigint), (8::smallint, 1::bigint), (31::smallint, 3::bigint)$$,
  'score array ordinality maps representative values to question sequence'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select extensions.throws_ok(
  format('select public.submit_health_check(%L::uuid, array_fill(7::smallint, array[31]))', (select value from health_test_context where key = 'room_id')),
  '22023', 'already_completed',
  'second submit is explicit and cannot aggregate twice'
);
reset role;
select extensions.is(
  (select sum(score_sum)::text from public.health_check_question_aggregates where room_id = (select value::uuid from health_test_context where key = 'room_id')),
  '118',
  'double submit leaves aggregate sums unchanged'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
select extensions.throws_ok(
  format('select public.leave_session(%L::uuid)', (select value from health_test_context where key = 'room_id')),
  '42501', 'health_check_leave_locked',
  'generic leave is locked after collection starts'
);

select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  format('select public.finalize_health_check(%L::uuid)', (select value from health_test_context where key = 'room_id')),
  '22023', 'health_check_incomplete',
  'finalize rejects a cohort that is not fully completed'
);
reset role;
insert into health_test_context (key, value)
select 'member_a_id', id::text from public.participants
where session_id = (select value::uuid from health_test_context where key = 'room_id')
  and user_id = '61000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  format('select public.remove_health_check_respondent(%L::uuid, %L::uuid)',
    (select value from health_test_context where key = 'room_id'),
    (select value from health_test_context where key = 'member_a_id')),
  '22023', 'completed_respondent_locked',
  'completed respondent cannot be removed'
);
select extensions.ok(
  jsonb_array_length(public.get_health_check_progress((select value::uuid from health_test_context where key = 'room_id'))) = 5
  and not (public.get_health_check_progress((select value::uuid from health_test_context where key = 'room_id'))::text ~ 'joined_at|completed_at|score|progress|user_id'),
  'facilitator progress returns only five safe roster entries'
);

do $complete_remaining$
declare
  v_user uuid;
begin
  foreach v_user in array array[
    '61000000-0000-0000-0000-000000000003'::uuid,
    '61000000-0000-0000-0000-000000000004'::uuid,
    '61000000-0000-0000-0000-000000000005'::uuid,
    '61000000-0000-0000-0000-000000000006'::uuid
  ] loop
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    perform public.submit_health_check(
      (select value::uuid from health_test_context where key = 'room_id'),
      array_fill(4::smallint, array[31])
    );
  end loop;
end;
$complete_remaining$;

select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
insert into health_test_context (key, value)
select 'finalize_result', public.finalize_health_check(
  (select value::uuid from health_test_context where key = 'room_id')
)::text;
select extensions.is(
  (select value::jsonb->>'status' from health_test_context where key = 'finalize_result'),
  'download_pending',
  'fully completed cohort of five finalizes successfully'
);
select extensions.results_eq(
  $$select value::jsonb from health_test_context where key = 'finalize_result'$$,
  $$select jsonb_build_object(
      'status', 'download_pending',
      'job_id', id,
      'job_status', 'awaiting_materialization',
      'expires_at', expires_at
    ) from public.health_check_report_jobs
    where id = '63000000-0000-0000-0000-000000000001'$$,
  'initial finalize returns the created job exact expiry'
);
select extensions.is(
  public.restore_session((select value::uuid from health_test_context where key = 'room_id'))->>'status',
  'ok',
  'completed download-pending health room remains restorable until materialization'
);
select extensions.is(
  public.restore_session((select value::uuid from health_test_context where key = 'room_id'))->'session'->>'activity_type',
  'health_check',
  'download-pending restore returns the health activity membership snapshot'
);
select extensions.is(
  public.restore_session((select value::uuid from health_test_context where key = 'room_id'))->'participant'->>'role',
  'facilitator',
  'download-pending restore includes the authenticated health membership'
);
select extensions.results_eq(
  format('select public.finalize_health_check(%L::uuid)', (select value from health_test_context where key = 'room_id')),
  $$select jsonb_build_object(
      'status', 'download_pending',
      'job_id', id,
      'job_status', 'awaiting_materialization',
      'expires_at', expires_at
    ) from public.health_check_report_jobs
    where id = '63000000-0000-0000-0000-000000000001'$$,
  'owner finalize retry while source exists returns the existing job and exact expiry'
);
select extensions.results_eq(
  $$select public.get_health_check_download_status('63000000-0000-0000-0000-000000000001')$$,
  $$select jsonb_build_object(
      'status', 'awaiting_materialization',
      'filename', null,
      'expires_at', expires_at
    ) from public.health_check_report_jobs
    where id = '63000000-0000-0000-0000-000000000001'$$,
  'owner sees awaiting status with exact expiry and unchanged filename rule'
);
reset role;
select extensions.results_eq(
  format('select status, attempts, source_room_id, aad_room_id, facilitator_user_id from public.health_check_report_jobs where id = %L::uuid', '63000000-0000-0000-0000-000000000001'),
  format('values (%L::text, 0::integer, %L::uuid, %L::uuid, %L::uuid)', 'awaiting_materialization', (select value from health_test_context where key = 'room_id'), (select value from health_test_context where key = 'room_id'), '61000000-0000-0000-0000-000000000001'),
  'finalize creates an awaiting-materialization job bound to its facilitator and AAD room'
);
select extensions.ok(
  (select encrypted_package is null and package_nonce is null
          and encryption_key_version is null and sanitized_filename is null
     from public.health_check_report_jobs
    where id = '63000000-0000-0000-0000-000000000001'),
  'finalize never claims a download package exists before materialization'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set status = 'ready'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'job cannot become ready before encrypted package materialization'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set status = 'processing', claimed_by = 'premature-worker',
           lease_expires_at = null
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'processing requires a complete claim and lease'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set facilitator_user_id = '61000000-0000-0000-0000-000000000008'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_identity_is_immutable',
  'authorization binding is immutable'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set aad_room_id = '00000000-0000-0000-0000-000000000001'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_identity_is_immutable',
  'AAD room is immutable'
);
set local session_replication_role = replica;
update public.health_check_sessions
   set expires_at = statement_timestamp() + interval '5 minutes'
 where room_id = (select value::uuid from health_test_context where key = 'room_id');
update public.health_check_report_jobs
   set expires_at = statement_timestamp() + interval '5 minutes'
 where id = '63000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
insert into health_test_context (key, value)
select 'source_expires_at', expires_at::text
  from public.health_check_sessions
 where room_id = (select value::uuid from health_test_context where key = 'room_id');
set local role service_role;
select extensions.throws_ok(
  $$select * from public.get_health_check_report_snapshot_for_service(
    '63000000-0000-0000-0000-000000000001', 'report-worker'
  )$$,
  '55000', 'health_check_report_job_not_claimed',
  'snapshot denies an unclaimed report job'
);
select extensions.lives_ok(
  $$select private.claim_health_check_report_job(
    '63000000-0000-0000-0000-000000000001', 'report-worker', interval '1 minute'
  )$$,
  'awaiting job can be claimed for processing'
);
select extensions.throws_ok(
  $$select * from public.get_health_check_report_snapshot_for_service(
    '63000000-0000-0000-0000-000000000001', 'wrong-worker'
  )$$,
  '55000', 'health_check_report_job_not_claimed',
  'snapshot denies a worker that does not own the claim'
);
select extensions.is(
  private.fail_health_check_report_job(
    '63000000-0000-0000-0000-000000000001', 'wrong-worker'
  ),
  false,
  'a mismatched worker cannot fail a claimed report job'
);
select extensions.results_eq(
  $$select status, claimed_by, lease_expires_at is not null
      from public.health_check_report_jobs
     where id = '63000000-0000-0000-0000-000000000001'$$,
  $$values ('processing'::text, 'report-worker'::text, true)$$,
  'a mismatched fail attempt retains processing state and its lease'
);
select extensions.is(
  private.fail_health_check_report_job(
    '63000000-0000-0000-0000-000000000001', 'report-worker'
  ),
  true,
  'the claiming worker can fail its report job'
);
select extensions.results_eq(
  $$select status, claimed_by, lease_expires_at
      from public.health_check_report_jobs
     where id = '63000000-0000-0000-0000-000000000001'$$,
  $$values ('failed'::text, null::text, null::timestamptz)$$,
  'failing a report job clears its claim and lease'
);
select extensions.is(
  private.claim_health_check_report_job(
    '63000000-0000-0000-0000-000000000001', 'report-worker', interval '1 minute'
  ),
  true,
  'a failed report job can be reclaimed while unexpired'
);
select extensions.results_eq(
  $$select status, attempts from public.health_check_report_jobs
     where id = '63000000-0000-0000-0000-000000000001'$$,
  $$values ('processing'::text, 2)$$,
  'reclaim increments attempts monotonically and restores processing state'
);
insert into health_report_snapshot (
  job_id, aad_room_id, squad_name, measurement_date, template_version,
  expected_respondent_count, area_key, area_sequence, area_title,
  area_introduction, area_description, question_key, question_sequence,
  question_text, score_sum, response_count
)
select * from public.get_health_check_report_snapshot_for_service(
  '63000000-0000-0000-0000-000000000001', 'report-worker'
);
select extensions.is(
  (select count(*)::text from health_report_snapshot),
  '31',
  'claimed worker receives exactly 31 report snapshot lines'
);
select extensions.ok(
  not exists (
    select 1
      from health_report_snapshot as current_line
      join health_report_snapshot as previous_line
        on previous_line.line_number = current_line.line_number - 1
     where (current_line.area_sequence, current_line.question_sequence)
           < (previous_line.area_sequence, previous_line.question_sequence)
  )
  and (select min(expected_respondent_count) = 5
              and max(expected_respondent_count) = 5
              and min(response_count) = 5
              and max(response_count) = 5
         from health_report_snapshot)
  and (select count(distinct area_key) = 7 from health_report_snapshot),
  'snapshot lines are deterministic and carry aggregate-derived cohort and catalog fields'
);
select extensions.results_eq(
  $$select squad_name, measurement_date, template_version,
           question_sequence, score_sum, response_count
      from health_report_snapshot
     order by line_number
     limit 1$$,
  $$values ('Squad Sikker'::text, date '2026-08-26', 'squad-health-v1'::text,
            1::smallint, 17::bigint, 5::integer)$$,
  'snapshot returns the expected immutable metadata and aggregate values'
);
select extensions.is(
  (select string_agg(key, ',' order by key)
     from jsonb_object_keys(
       (select to_jsonb(snapshot_line) - 'line_number'
          from health_report_snapshot as snapshot_line
         order by line_number limit 1)
     ) as keys(key)),
  'aad_room_id,area_description,area_introduction,area_key,area_sequence,area_title,expected_respondent_count,job_id,measurement_date,question_key,question_sequence,question_text,response_count,score_sum,squad_name,template_version',
  'snapshot JSON has exactly the approved keys and no identity or completion fields'
);
reset role;

set local session_replication_role = replica;
update public.health_check_report_jobs
   set lease_expires_at = statement_timestamp() - interval '1 second'
 where id = '63000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
set local role service_role;
select extensions.throws_ok(
  $$select * from public.get_health_check_report_snapshot_for_service(
    '63000000-0000-0000-0000-000000000001', 'report-worker'
  )$$,
  '55000', 'health_check_report_job_not_claimed',
  'snapshot denies a stale worker lease'
);
select extensions.ok(
  (select regexp_count(prosrc, 'v_checked_at\s*:=\s*clock_timestamp\(\)', 1, 'i') = 4
          and regexp_replace(lower(prosrc), '\s+', ' ', 'g')
            like '%v_session_found boolean;%for update; v_session_found := found; v_checked_at := clock_timestamp(); if v_job.status <> ''processing''%health_check_report_job_not_claimed%if v_job.expires_at <= v_checked_at or v_health.expires_at <= v_checked_at then%job_expired%if not v_session_found%health_check_report_snapshot_invariant%'
          and regexp_replace(lower(prosrc), '\s+', ' ', 'g')
            like '%health_check_report_snapshot_invariant%end if; v_checked_at := clock_timestamp(); if v_job.status <> ''processing''%health_check_report_job_not_claimed%if v_job.expires_at <= v_checked_at or v_health.expires_at <= v_checked_at then%job_expired%end if; return query%'
     from pg_proc
    where oid = 'public.get_health_check_report_snapshot_for_service(uuid,text)'::regprocedure),
  'snapshot takes fresh time after every blocking stage and checks lease before expiry and invariants'
);
reset role;
set local session_replication_role = replica;
update public.health_check_report_jobs
   set lease_expires_at = statement_timestamp() + interval '1 minute',
       expires_at = statement_timestamp() - interval '1 second'
 where id = '63000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
set local role service_role;
select extensions.throws_ok(
  $$select * from public.get_health_check_report_snapshot_for_service(
    '63000000-0000-0000-0000-000000000001', 'report-worker'
  )$$,
  '55000', 'job_expired',
  'snapshot denies an expired report job'
);
reset role;
set local session_replication_role = replica;
update public.health_check_report_jobs
   set expires_at = (select value::timestamptz from health_test_context where key = 'source_expires_at')
 where id = '63000000-0000-0000-0000-000000000001';
update public.health_check_sessions
   set expires_at = statement_timestamp() - interval '1 second'
 where room_id = (select value::uuid from health_test_context where key = 'room_id');
set local session_replication_role = origin;
set local role service_role;
select extensions.throws_ok(
  $$select * from public.get_health_check_report_snapshot_for_service(
    '63000000-0000-0000-0000-000000000001', 'report-worker'
  )$$,
  '55000', 'job_expired',
  'snapshot denies an expired locked source session'
);
reset role;
set local session_replication_role = replica;
update public.health_check_sessions
   set expires_at = (select value::timestamptz from health_test_context where key = 'source_expires_at'),
       phase = 'collecting'
 where room_id = (select value::uuid from health_test_context where key = 'room_id');
update public.sessions
   set status = 'active'
 where id = (select value::uuid from health_test_context where key = 'room_id');
set local session_replication_role = origin;
set local role service_role;
select extensions.throws_ok(
  $$select * from public.get_health_check_report_snapshot_for_service(
    '63000000-0000-0000-0000-000000000001', 'report-worker'
  )$$,
  '55000', 'health_check_report_snapshot_invariant',
  'snapshot rejects a corrupted collecting non-finalized source fixture'
);
reset role;
set local session_replication_role = replica;
update public.health_check_sessions
   set phase = 'download_pending'
 where room_id = (select value::uuid from health_test_context where key = 'room_id');
update public.sessions
   set status = 'completed'
 where id = (select value::uuid from health_test_context where key = 'room_id');
set local session_replication_role = origin;

update public.health_check_question_aggregates as a
   set response_count = 4
  from public.health_check_questions as q
 where a.room_id = (select value::uuid from health_test_context where key = 'room_id')
   and q.template_version = a.template_version
   and q.question_key = a.question_key
   and q.sequence = 1;
set local role service_role;
select extensions.throws_ok(
  $$select * from public.get_health_check_report_snapshot_for_service(
    '63000000-0000-0000-0000-000000000001', 'report-worker'
  )$$,
  '55000', 'health_check_report_snapshot_invariant',
  'snapshot rejects inconsistent aggregate response counts'
);
reset role;
update public.health_check_question_aggregates as a
   set response_count = 5
  from public.health_check_questions as q
 where a.room_id = (select value::uuid from health_test_context where key = 'room_id')
   and q.template_version = a.template_version
   and q.question_key = a.question_key
   and q.sequence = 1;

create temporary table health_saved_question as
select * from public.health_check_questions
 where template_version = 'squad-health-v1' and sequence = 31;
set local session_replication_role = replica;
delete from public.health_check_questions
 where template_version = 'squad-health-v1' and sequence = 31;
set local session_replication_role = origin;
set local role service_role;
select extensions.throws_ok(
  $$select * from public.get_health_check_report_snapshot_for_service(
    '63000000-0000-0000-0000-000000000001', 'report-worker'
  )$$,
  '55000', 'health_check_report_snapshot_invariant',
  'snapshot rejects an incomplete immutable catalog fixture'
);
reset role;
insert into public.health_check_questions
select * from health_saved_question;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  $$select * from public.get_health_check_report_snapshot_for_service(
    '63000000-0000-0000-0000-000000000001', 'report-worker'
  )$$,
  '42501', null,
  'authenticated cannot execute the service report snapshot wrapper'
);
select extensions.throws_ok(
  $$select private.claim_health_check_report_job(
    '63000000-0000-0000-0000-000000000001', 'client-worker', interval '1 minute'
  )$$,
  '42501', null,
  'authenticated cannot execute package claim at runtime'
);
select extensions.throws_ok(
  $$select private.fail_health_check_report_job(
    '63000000-0000-0000-0000-000000000001', 'client-worker'
  )$$,
  '42501', null,
  'authenticated cannot execute package failure at runtime'
);
select extensions.throws_ok(
  $$select private.materialize_health_check_download(
    '63000000-0000-0000-0000-000000000001', 'report-worker', decode(repeat('ab', 64), 'hex'),
    decode(repeat('01', 12), 'hex'), 1, 'squad-sikker-2026-08-26.zip'
  )$$,
  '42501', null,
  'authenticated cannot execute package materialization at runtime'
);
reset role;
set local role service_role;
select extensions.throws_ok(
  $$select private.materialize_health_check_download(
    '63000000-0000-0000-0000-000000000001', 'report-worker', ''::bytea,
    decode(repeat('01', 12), 'hex'), 1, 'squad-sikker-2026-08-26.zip'
  )$$,
  '22023', 'invalid_health_check_download_package',
  'materialization rejects an empty encrypted package atomically'
);
select extensions.throws_ok(
  $$select private.materialize_health_check_download(
    '63000000-0000-0000-0000-000000000001', 'report-worker',
    decode(repeat('aa', 4194321), 'hex'),
    decode(repeat('01', 12), 'hex'), 1, 'squad-sikker-2026-08-26.zip'
  )$$,
  '23514', null,
  'database rejects an encrypted package larger than 4 MiB plus its GCM tag'
);
reset role;
select extensions.is(
  (select count(*)::text from public.sessions where id = (select value::uuid from health_test_context where key = 'room_id')),
  '1',
  'failed materialization retains live room data for retry'
);
set local role service_role;
select extensions.lives_ok(
  $$select private.materialize_health_check_download(
    '63000000-0000-0000-0000-000000000001', 'report-worker', decode(repeat('ab', 64), 'hex'),
    decode(repeat('01', 12), 'hex'), 1, 'squad-sikker-2026-08-26.zip'
  )$$,
  'claimed worker atomically materializes the encrypted ZIP'
);
reset role;
select extensions.results_eq(
  $$select status, source_room_id, octet_length(encrypted_package), octet_length(package_nonce), encryption_key_version, sanitized_filename
      from public.health_check_report_jobs where id = '63000000-0000-0000-0000-000000000001'$$,
  $$values ('ready'::text, null::uuid, 64, 12, 1, 'squad-sikker-2026-08-26.zip'::text)$$,
  'ready job contains one encrypted package and no source relationship'
);
select extensions.ok(
  (select expires_at > materialized_at
          and expires_at <= materialized_at + interval '15 minutes'
          and expires_at = (select value::timestamptz from health_test_context where key = 'source_expires_at')
     from public.health_check_report_jobs where id = '63000000-0000-0000-0000-000000000001'),
  'ready package expires at the earlier original source expiry near the main TTL'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set encrypted_package = decode(repeat('cd', 64), 'hex'),
           sanitized_filename = 'replacement.zip'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_ready_is_immutable',
  'ready package and filename are immutable'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set status = 'failed'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_ready_is_immutable',
  'ready is terminal'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set attempts = attempts + 1, next_attempt_at = statement_timestamp()
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_ready_is_immutable',
  'ready retry metadata is immutable'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set expires_at = expires_at - interval '1 second'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_ready_is_immutable',
  'ready expiry is immutable'
);
select extensions.lives_ok(
  $$update public.health_check_report_jobs
       set attempts = attempts
     where id = '63000000-0000-0000-0000-000000000001'$$,
  'ready exact no-op update is allowed'
);
select extensions.results_eq(
  format($sql$
    select
      (select count(*) from public.sessions where id = %1$L::uuid),
      (select count(*) from public.participants where session_id = %1$L::uuid),
      (select count(*) from public.health_check_sessions where room_id = %1$L::uuid),
      (select count(*) from public.health_check_respondents where room_id = %1$L::uuid),
      (select count(*) from public.health_check_question_aggregates where room_id = %1$L::uuid),
      (select count(*) from public.health_check_report_jobs
        where id = '63000000-0000-0000-0000-000000000001' and status = 'ready')
  $sql$, (select value from health_test_context where key = 'room_id')),
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 1::bigint)$$,
  'materialization deletes every live row and retains exactly one ready job'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select extensions.is(
  public.restore_session((select value::uuid from health_test_context where key = 'room_id'))->>'status',
  'membership_missing',
  'health restore returns membership_missing after materialization deletes the room'
);
select extensions.results_eq(
  $$select public.get_health_check_download_status('63000000-0000-0000-0000-000000000001')$$,
  $$select jsonb_build_object(
      'status', 'ready',
      'filename', 'squad-sikker-2026-08-26.zip',
      'expires_at', expires_at
    ) from public.health_check_report_jobs
    where id = '63000000-0000-0000-0000-000000000001'$$,
  'owner sees ready status, safe filename and exact expiry'
);
select extensions.results_eq(
  format('select public.finalize_health_check(%L::uuid)', (select value from health_test_context where key = 'room_id')),
  $$select jsonb_build_object(
      'status', 'download_pending',
      'job_id', id,
      'job_status', 'ready',
      'expires_at', expires_at
    ) from public.health_check_report_jobs
    where id = '63000000-0000-0000-0000-000000000001'$$,
  'owner finalize retry after source deletion returns the existing ready job and exact expiry'
);
select extensions.throws_ok(
  $$select * from private.get_health_check_download_package(
    '63000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001'
  )$$,
  '42501', null,
  'authenticated clients cannot execute the binary package function'
);
select extensions.throws_ok(
  $$select * from public.get_health_check_download_package_for_service(
    '63000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001'
  )$$,
  '42501', null,
  'authenticated clients cannot execute the service package wrapper'
);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000008', true);
select extensions.throws_ok(
  format('select public.finalize_health_check(%L::uuid)', (select value from health_test_context where key = 'room_id')),
  '42501', 'facilitator_required',
  'outsider cannot discover an owner job through finalize after source deletion'
);
select extensions.throws_ok(
  $$select public.get_health_check_download_status('63000000-0000-0000-0000-000000000001')$$,
  '42501', 'download_not_found',
  'non-owner cannot read download status'
);
reset role;
set local role service_role;
select extensions.is(
  (select count(*)::text from private.get_health_check_download_package(
    '63000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000008')),
  '0',
  'package function denies a mismatched user id'
);
select extensions.is(
  (select count(*)::text from private.get_health_check_download_package(
    '63000000-0000-0000-0000-000000000001', null)),
  '0',
  'package function returns nothing without facilitator authentication'
);
select extensions.results_eq(
  $$select octet_length(encrypted_package), octet_length(package_nonce),
           encryption_key_version, sanitized_filename, aad_room_id
      from private.get_health_check_download_package(
    '63000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001')$$,
  format(
    'values (64::integer, 12::integer, 1::integer, %L::text, %L::uuid)',
    'squad-sikker-2026-08-26.zip',
    (select value from health_test_context where key = 'room_id')
  ),
  'owner package envelope includes ciphertext metadata, filename and canonical AAD room'
);
select extensions.results_eq(
  $$select octet_length(encrypted_package), octet_length(package_nonce),
           encryption_key_version, sanitized_filename, aad_room_id
      from public.get_health_check_download_package_for_service(
    '63000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001')$$,
  format(
    'values (64::integer, 12::integer, 1::integer, %L::text, %L::uuid)',
    'squad-sikker-2026-08-26.zip',
    (select value from health_test_context where key = 'room_id')
  ),
  'service wrapper returns the same owner-bound package envelope'
);
select extensions.is(
  (select count(*)::text from public.get_health_check_download_package_for_service(
    '63000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000008')),
  '0',
  'service wrapper preserves owner mismatch denial'
);
reset role;
set local session_replication_role = replica;
update public.health_check_report_jobs
   set expires_at = statement_timestamp() - interval '1 second'
 where id = '63000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select extensions.results_eq(
  $$select public.get_health_check_download_status('63000000-0000-0000-0000-000000000001')$$,
  $$select jsonb_build_object(
      'status', 'expired',
      'filename', null,
      'expires_at', expires_at
    ) from public.health_check_report_jobs
    where id = '63000000-0000-0000-0000-000000000001'$$,
  'owner sees expired with exact expiry and no filename after package expiry'
);
select extensions.results_eq(
  format('select public.finalize_health_check(%L::uuid)', (select value from health_test_context where key = 'room_id')),
  $$select jsonb_build_object(
      'status', 'download_pending',
      'job_id', id,
      'job_status', 'expired',
      'expires_at', expires_at
    ) from public.health_check_report_jobs
    where id = '63000000-0000-0000-0000-000000000001'$$,
  'owner finalize retry reports an expired ready package and exact expiry before cleanup'
);
reset role;
set local role service_role;
select extensions.is(
  (select count(*)::text from private.get_health_check_download_package(
    '63000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001')),
  '0',
  'expired package is denied even before cleanup physically deletes it'
);
reset role;

set local role service_role;
insert into health_test_context (key, value)
select 'abort_room', public.create_health_check_room(
  '61000000-0000-0000-0000-000000000009',
  '62000000-0000-0000-0000-000000000009', 'Abort Fac', 'Abort Squad', date '2026-08-26',
  '63000000-0000-0000-0000-000000000009'
)->'session'->>'id';
do $join_abort_members$
declare
  v_user uuid;
begin
  foreach v_user in array array[
    '61000000-0000-0000-0000-000000000002'::uuid,
    '61000000-0000-0000-0000-000000000003'::uuid,
    '61000000-0000-0000-0000-000000000004'::uuid,
    '61000000-0000-0000-0000-000000000005'::uuid
  ] loop
    perform public.join_health_check_room(
      v_user,
      (select join_code from public.sessions
        where id = (select value::uuid from health_test_context where key = 'abort_room')),
      'Small ' || right(v_user::text, 1)
    );
  end loop;
end;
$join_abort_members$;
reset role;
insert into public.health_check_respondents (room_id, member_id, state)
select (select value::uuid from health_test_context where key = 'abort_room'), id, 'completed'
from public.participants
where session_id = (select value::uuid from health_test_context where key = 'abort_room')
  and role = 'participant';
insert into public.health_check_question_aggregates (
  room_id, template_version, question_key, score_sum, response_count
)
select (select value::uuid from health_test_context where key = 'abort_room'),
       template_version, question_key, 16, 4
from public.health_check_questions where template_version = 'squad-health-v1';
update public.health_check_sessions set phase = 'collecting', opened_at = now()
where room_id = (select value::uuid from health_test_context where key = 'abort_room');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000009', true);
select extensions.throws_ok(
  format('select public.finalize_health_check(%L::uuid)', (select value from health_test_context where key = 'abort_room')),
  '22023', 'health_check_minimum_participants',
  'finalize rejects a fully completed cohort smaller than five'
);
select extensions.is(
  public.abort_health_check((select value::uuid from health_test_context where key = 'abort_room'))->>'status',
  'aborted',
  'facilitator can abort before delivery pending'
);
select extensions.throws_ok(
  format('select public.abort_health_check(%L::uuid)', (select value from health_test_context where key = 'abort_room')),
  '42501', 'facilitator_required',
  'abort retry after deletion returns the same generic unavailable error as an unknown room'
);
select extensions.is(
  (select count(*)::text from public.sessions where id = (select value::uuid from health_test_context where key = 'abort_room')),
  '0',
  'abort cascades the entire live room without a report job'
);

reset role;
set local role service_role;
insert into health_test_context (key, value)
select 'cleanup_room', public.create_health_check_room(
  '61000000-0000-0000-0000-000000000010',
  '62000000-0000-0000-0000-000000000010', 'Cleanup Fac', 'Cleanup Squad', date '2026-08-26',
  '63000000-0000-0000-0000-000000000010'
)->'session'->>'id';
select public.join_health_check_room(
  '61000000-0000-0000-0000-000000000008',
  (select join_code from public.sessions where id = (select value::uuid from health_test_context where key = 'cleanup_room')),
  'Expiring Member'
);
reset role;
select extensions.throws_ok(
  format($sql$
    insert into public.health_check_report_jobs (
      id, source_room_id, facilitator_user_id, aad_room_id,
      status, next_attempt_at, expires_at, idempotency_key
    ) values (
      '63000000-0000-0000-0000-000000000010', %1$L::uuid,
      '61000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000004',
      'awaiting_materialization', now(),
      (select expires_at from public.health_check_sessions where room_id = %1$L::uuid),
      'health-check:63000000-0000-0000-0000-000000000010'
    )
  $sql$, (select value from health_test_context where key = 'cleanup_room')),
  '23514', 'health_check_report_job_source_mismatch',
  'report job insert rejects AAD that differs from its source room'
);
select extensions.throws_ok(
  format($sql$
    insert into public.health_check_report_jobs (
      id, source_room_id, facilitator_user_id, aad_room_id,
      status, next_attempt_at, expires_at, idempotency_key
    ) values (
      '63000000-0000-0000-0000-000000000010', %1$L::uuid,
      '61000000-0000-0000-0000-000000000010', %1$L::uuid,
      'awaiting_materialization', now(),
      (select expires_at + interval '1 minute' from public.health_check_sessions where room_id = %1$L::uuid),
      'health-check:63000000-0000-0000-0000-000000000010'
    )
  $sql$, (select value from health_test_context where key = 'cleanup_room')),
  '23514', 'health_check_report_job_expiry_mismatch',
  'report job insert rejects expiry later than its source health session'
);
insert into public.health_check_report_jobs (
  id, source_room_id, facilitator_user_id, aad_room_id,
  status, next_attempt_at, expires_at, idempotency_key
) values (
  '63000000-0000-0000-0000-000000000010',
  (select value::uuid from health_test_context where key = 'cleanup_room'),
  '61000000-0000-0000-0000-000000000010',
  (select value::uuid from health_test_context where key = 'cleanup_room'),
  'awaiting_materialization', now(),
  (select expires_at from public.health_check_sessions where room_id = (select value::uuid from health_test_context where key = 'cleanup_room')),
  'health-check:63000000-0000-0000-0000-000000000010'
);
insert into health_test_context (key, value)
select 'cleanup_expires_at', expires_at::text
  from public.health_check_sessions
 where room_id = (select value::uuid from health_test_context where key = 'cleanup_room');
update public.health_check_report_jobs
   set status = 'processing', claimed_by = 'stale-worker',
       lease_expires_at = statement_timestamp() - interval '1 minute'
 where id = '63000000-0000-0000-0000-000000000010';
set local role service_role;
select private.cleanup_expired_health_checks();
reset role;
select extensions.results_eq(
  $$select status, claimed_by, lease_expires_at from public.health_check_report_jobs
     where id = '63000000-0000-0000-0000-000000000010'$$,
  $$values ('failed'::text, null::text, null::timestamptz)$$,
  'cleanup releases a stale processing lease to failed'
);
select extensions.is(
  (select count(*)::text from public.sessions where id = (select value::uuid from health_test_context where key = 'cleanup_room')),
  '1',
  'stale lease cleanup retains the unexpired live room for retry'
);
select extensions.ok(
  (select regexp_count(prosrc, 'clock_timestamp\(\)', 1, 'i') = 1
      and regexp_replace(prosrc, '\s+', ' ', 'g')
        like '%v_cleanup_at timestamptz := clock_timestamp();%'
      and regexp_replace(prosrc, '\s+', ' ', 'g')
        like '%expires_at <= v_cleanup_at%next_attempt_at = v_cleanup_at%lease_expires_at <= v_cleanup_at%expires_at > v_cleanup_at%h.expires_at <= v_cleanup_at%'
     from pg_proc
    where oid = 'private.cleanup_expired_health_checks()'::regprocedure),
  'cleanup uses one immutable run cutoff for jobs, leases, and source rooms'
);
set local role service_role;
select extensions.is(
  private.claim_health_check_report_job(
    '63000000-0000-0000-0000-000000000010', 'expiry-worker', interval '1 minute'
  ),
  true,
  'worker claims the retry job before its main expiry'
);
reset role;
set local session_replication_role = replica;
update public.health_check_sessions set expires_at = now() - interval '1 minute'
where room_id = (select value::uuid from health_test_context where key = 'cleanup_room');
set local session_replication_role = origin;
set local role service_role;
select extensions.throws_ok(
  $$select private.materialize_health_check_download(
    '63000000-0000-0000-0000-000000000010', 'expiry-worker', decode(repeat('ab', 64), 'hex'),
    decode(repeat('01', 12), 'hex'), 1, 'cleanup-2026-08-26.zip'
  )$$,
  '55000', 'job_expired',
  'materialization is denied when the locked source health session has expired'
);
reset role;
set local session_replication_role = replica;
update public.health_check_sessions
   set expires_at = (select value::timestamptz from health_test_context where key = 'cleanup_expires_at')
 where room_id = (select value::uuid from health_test_context where key = 'cleanup_room');
update public.health_check_report_jobs
   set expires_at = statement_timestamp() - interval '1 second'
  where id = '63000000-0000-0000-0000-000000000010';
set local session_replication_role = origin;
set local role service_role;
select extensions.is(
  private.fail_health_check_report_job(
    '63000000-0000-0000-0000-000000000010', 'expiry-worker'
  ),
  false,
  'an expired processing report job cannot be failed'
);
select extensions.results_eq(
  $$select status, claimed_by from public.health_check_report_jobs
     where id = '63000000-0000-0000-0000-000000000010'$$,
  $$values ('processing'::text, 'expiry-worker'::text)$$,
  'an expired fail attempt retains the existing claim for cleanup'
);
select extensions.throws_ok(
  $$select private.materialize_health_check_download(
    '63000000-0000-0000-0000-000000000010', 'expiry-worker', decode(repeat('ab', 64), 'hex'),
    decode(repeat('01', 12), 'hex'), 1, 'cleanup-2026-08-26.zip'
  )$$,
  '55000', 'job_expired',
  'materialization is denied when the locked job has expired'
);
reset role;
select extensions.ok(
  (select encrypted_package is null and materialized_at is null
     from public.health_check_report_jobs where id = '63000000-0000-0000-0000-000000000010')
  and exists (
    select 1 from public.sessions
     where id = (select value::uuid from health_test_context where key = 'cleanup_room')
  ),
  'denied expired materialization retains the live room and creates no package until cleanup'
);
set local session_replication_role = replica;
update public.health_check_sessions set expires_at = statement_timestamp() - interval '1 minute'
where room_id = (select value::uuid from health_test_context where key = 'cleanup_room');
set local session_replication_role = origin;
set local role service_role;
select extensions.is(
  public.join_health_check_room(
    '61000000-0000-0000-0000-000000000008',
    (select join_code from public.sessions where id = (select value::uuid from health_test_context where key = 'cleanup_room')),
    'Expired'
  )->>'status',
  'session_not_found',
  'service join treats an expired lobby as unavailable'
);
select extensions.is(
  public.create_health_check_room(
    '61000000-0000-0000-0000-000000000010',
    '62000000-0000-0000-0000-000000000010', 'Ignored', 'Ignored', current_date,
    '63000000-0000-0000-0000-000000000099'
  )->>'status',
  'request_already_used',
  'expired room permanently consumes its create request id'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000010', true);
select extensions.throws_ok(
  format('select public.get_health_check_state(%L::uuid)', (select value from health_test_context where key = 'cleanup_room')),
  '42501', 'membership_required',
  'expired health state is unavailable even to its facilitator'
);
select extensions.throws_ok(
  format('select public.start_health_check(%L::uuid)', (select value from health_test_context where key = 'cleanup_room')),
  '42501', 'facilitator_required',
  'expired health room cannot be started'
);
select extensions.throws_ok(
  format('select public.get_health_check_progress(%L::uuid)', (select value from health_test_context where key = 'cleanup_room')),
  '42501', 'facilitator_required',
  'expired health progress is unavailable'
);
select extensions.throws_ok(
  format('select public.remove_health_check_respondent(%L::uuid, %L::uuid)',
    (select value from health_test_context where key = 'cleanup_room'),
    '00000000-0000-0000-0000-000000000001'),
  '42501', 'facilitator_required',
  'expired health room cannot remove respondents'
);
select extensions.throws_ok(
  format('select public.abort_health_check(%L::uuid)', (select value from health_test_context where key = 'cleanup_room')),
  '42501', 'facilitator_required',
  'expired health room cannot be aborted through the client RPC'
);
select extensions.results_eq(
  format('select public.finalize_health_check(%L::uuid)', (select value from health_test_context where key = 'cleanup_room')),
  $$select jsonb_build_object(
      'status', 'download_pending',
      'job_id', id,
      'job_status', 'expired',
      'expires_at', expires_at
    ) from public.health_check_report_jobs
    where id = '63000000-0000-0000-0000-000000000010'$$,
  'owner finalize retry reports an expired source job and exact expiry before cleanup'
);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000008', true);
select extensions.throws_ok(
  format('select public.submit_health_check(%L::uuid, array_fill(4::smallint, array[31]))', (select value from health_test_context where key = 'cleanup_room')),
  '42501', 'respondent_required',
  'expired health room rejects respondent submission'
);
select extensions.is(
  public.leave_session((select value::uuid from health_test_context where key = 'cleanup_room'))->>'status',
  'membership_missing',
  'expired health room hides membership from leave'
);
select extensions.is(
  public.restore_session((select value::uuid from health_test_context where key = 'cleanup_room'))->>'status',
  'membership_missing',
  'expired health room hides membership from restore'
);
reset role;
set local role service_role;
select private.cleanup_expired_health_checks();
reset role;
select extensions.is(
  (select count(*)::text from public.health_check_report_jobs where id = '63000000-0000-0000-0000-000000000001'),
  '0',
  'cleanup deletes expired ready packages'
);
select extensions.is(
  (select count(*)::text from public.sessions where id = (select value::uuid from health_test_context where key = 'cleanup_room')),
  '0',
  'cleanup deletes expired health rooms through session cascade'
);
select extensions.is(
  (select count(*)::text from public.health_check_report_jobs where id = '63000000-0000-0000-0000-000000000010'),
  '0',
  'cleanup deletes expired report jobs'
);

select * from extensions.finish();
rollback;
