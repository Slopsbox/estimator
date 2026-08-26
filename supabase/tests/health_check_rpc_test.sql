-- `supabase test db --local supabase/tests/health_check_rpc_test.sql`
-- Requires all migrations through anonymous_health_check_core.
begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(115);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('61000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'health-fac@test.invalid', now(), now()),
  ('61000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'health-a@test.invalid', now(), now()),
  ('61000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'health-b@test.invalid', now(), now()),
  ('61000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'health-c@test.invalid', now(), now()),
  ('61000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'health-d@test.invalid', now(), now()),
  ('61000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'health-e@test.invalid', now(), now()),
  ('61000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'health-f@test.invalid', now(), now()),
  ('61000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'health-outsider@test.invalid', now(), now()),
  ('61000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'abort-fac@test.invalid', now(), now()),
  ('61000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'cleanup-fac@test.invalid', now(), now());

create temporary table health_test_context (key text primary key, value text not null);
grant all on health_test_context to service_role, authenticated;

set local role service_role;
insert into health_test_context (key, value)
select 'create_result', public.create_health_check_room(
  '61000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  '  Ada  ',
  '  Squad Sikker  ',
  date '2026-08-26',
  '63000000-0000-0000-0000-000000000001',
  decode(repeat('ab', 32), 'hex'),
  decode(repeat('01', 12), 'hex'),
  1
)::text;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select extensions.throws_ok(
  $$select public.create_health_check_room(
    '61000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000099',
    'Ada', 'Denied', date '2026-08-26',
    '63000000-0000-0000-0000-000000000099',
    decode(repeat('12', 32), 'hex'), decode(repeat('05', 12), 'hex'), 1
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
      encrypted_facilitator_email, email_nonce, email_key_version, expires_at
    ) values (
      '64000000-0000-0000-0000-000000000001',
      '64000000-0000-0000-0000-000000000003', 'squad-health-v1',
      'Too long', current_date, decode(repeat('aa', 32), 'hex'),
      decode(repeat('09', 12), 'hex'), 1,
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
    '63000000-0000-0000-0000-000000000099',
    decode(repeat('cd', 32), 'hex'), decode(repeat('02', 12), 'hex'), 2
  )->'session'->>'id',
  (select value from health_test_context where key = 'room_id'),
  'same facilitator and request id return the existing room snapshot'
);
select extensions.is(
  public.create_health_check_room(
    '61000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000099',
    'Ada', 'Other squad', date '2026-08-27',
    '63000000-0000-0000-0000-000000000099',
    decode(repeat('cd', 32), 'hex'), decode(repeat('02', 12), 'hex'), 2
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
  not (public.get_health_check_state((select value::uuid from health_test_context where key = 'room_id'))::text ~ 'email|aggregate|score|user_id'),
  'member state excludes email, aggregates, scores and auth ids'
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
select extensions.is(
  public.finalize_health_check((select value::uuid from health_test_context where key = 'room_id'))->>'status',
  'delivery_pending',
  'fully completed cohort of five finalizes successfully'
);
reset role;
select extensions.results_eq(
  format('select status, attempts, source_room_id, aad_room_id from public.health_check_report_jobs where id = %L::uuid', '63000000-0000-0000-0000-000000000001'),
  format('values (%L::text, 0::integer, %L::uuid, %L::uuid)', 'awaiting_materialization', (select value from health_test_context where key = 'room_id'), (select value from health_test_context where key = 'room_id')),
  'finalize creates an awaiting-materialization durable outbox job with stable AAD room'
);
select extensions.ok(
  (select encrypted_recipient = decode(repeat('ab', 32), 'hex')
          and recipient_nonce = decode(repeat('01', 12), 'hex')
          and encrypted_report_snapshot is null and snapshot_nonce is null
     from public.health_check_report_jobs
    where id = '63000000-0000-0000-0000-000000000001'),
  'finalize copies the encrypted recipient envelope but does not claim a snapshot exists'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set status = 'pending'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'outbox cannot become pending before encrypted snapshot materialization'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set status = 'processing', claimed_by = 'premature-worker',
           lease_expires_at = statement_timestamp() + interval '1 minute'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_transition_is_invalid',
  'awaiting-materialization outbox cannot skip pending'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set claimed_by = 'worker-without-lease'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'outbox claim and lease nullity must match'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set encrypted_report_snapshot = decode(repeat('31', 32), 'hex')
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'outbox snapshot ciphertext and nonce must materialize together'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set encrypted_pdf = decode(repeat('32', 32), 'hex')
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'outbox artifact materialization requires a snapshot'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set encrypted_pdf = ''::bytea
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'outbox rejects an empty encrypted PDF'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set encrypted_csv = ''::bytea
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'outbox rejects an empty encrypted CSV'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set provider_message_id = 'provider-before-sent'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'provider message id is valid only for sent jobs'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set aad_room_id = '00000000-0000-0000-0000-000000000001'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_identity_is_immutable',
  'outbox AAD room cannot diverge from source and delivery identity'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set id = '00000000-0000-0000-0000-000000000002'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_identity_is_immutable',
  'outbox delivery id is immutable'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set source_room_id = '00000000-0000-0000-0000-000000000003'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_identity_is_immutable',
  'outbox source room is immutable'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set encrypted_recipient = decode(repeat('41', 32), 'hex')
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_identity_is_immutable',
  'outbox encrypted recipient is immutable'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set recipient_nonce = decode(repeat('42', 12), 'hex')
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_identity_is_immutable',
  'outbox recipient nonce is immutable'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set encryption_key_version = 2
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_identity_is_immutable',
  'outbox encryption key version is immutable'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set idempotency_key = 'changed'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_identity_is_immutable',
  'outbox idempotency key is immutable'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set expires_at = expires_at - interval '1 minute'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_identity_is_immutable',
  'outbox expiry must remain equal to source health expiry'
);
select extensions.throws_ok(
  format('delete from public.sessions where id = %L::uuid', (select value from health_test_context where key = 'room_id')),
  '23503', null,
  'durable outbox source FK prevents deletion of the live source room'
);
select extensions.lives_ok(
  $$update public.health_check_report_jobs
       set encrypted_report_snapshot = decode(repeat('33', 32), 'hex'),
           snapshot_nonce = decode(repeat('07', 12), 'hex')
     where id = '63000000-0000-0000-0000-000000000001'$$,
  'outbox snapshot and nonce can materialize exactly once together'
);
select extensions.lives_ok(
  $$update public.health_check_report_jobs
       set encrypted_pdf = decode(repeat('34', 32), 'hex')
     where id = '63000000-0000-0000-0000-000000000001'$$,
  'outbox PDF can materialize independently after the snapshot'
);
select extensions.lives_ok(
  $$update public.health_check_report_jobs
       set encrypted_csv = decode(repeat('35', 32), 'hex'), status = 'pending'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  'fully materialized outbox can transition to pending'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set status = 'processing'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'processing jobs require a claim and lease'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set status = 'sent'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'sent jobs require a provider message id'
);
select extensions.lives_ok(
  $$update public.health_check_report_jobs
       set status = 'processing', claimed_by = 'provider-id-test-worker',
           lease_expires_at = statement_timestamp() + interval '1 minute'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  'pending outbox can enter processing with a claim and lease'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set status = 'sent', provider_message_id = '   ',
           claimed_by = null, lease_expires_at = null
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'processing outbox requires a nonempty provider message id before sent'
);
select extensions.lives_ok(
  $$update public.health_check_report_jobs
       set status = 'pending', claimed_by = null, lease_expires_at = null
     where id = '63000000-0000-0000-0000-000000000001'$$,
  'processing outbox can return to pending after the provider-id test'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set status = 'awaiting_materialization'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_transition_is_invalid',
  'pending outbox cannot return to awaiting materialization'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set status = 'failed', claimed_by = 'failed-worker',
           lease_expires_at = statement_timestamp() + interval '1 minute'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'failed jobs cannot retain a claim or lease'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set status = 'sent', provider_message_id = 'provider-accepted',
           claimed_by = 'sent-worker',
           lease_expires_at = statement_timestamp() + interval '1 minute'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_transition_is_invalid',
  'pending outbox cannot skip processing even with a provider id and claim'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set encrypted_report_snapshot = decode(repeat('36', 32), 'hex')
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_snapshot_is_immutable',
  'materialized report snapshot can never be replaced'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set encrypted_report_snapshot = null, snapshot_nonce = null
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_snapshot_is_immutable',
  'materialized report snapshot and nonce can never be cleared'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set snapshot_nonce = decode(repeat('08', 12), 'hex')
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_snapshot_is_immutable',
  'materialized snapshot nonce can never be replaced'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set encrypted_pdf = decode(repeat('37', 32), 'hex')
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_artifacts_are_immutable',
  'materialized PDF can never be replaced'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set encrypted_csv = decode(repeat('38', 32), 'hex')
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_artifacts_are_immutable',
  'materialized CSV can never be replaced'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set encrypted_pdf = null
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_artifacts_are_immutable',
  'materialized PDF can never be cleared'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set encrypted_csv = null
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_artifacts_are_immutable',
  'materialized CSV can never be cleared'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set attempts = attempts - 1
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_attempts_cannot_decrease',
  'outbox attempts can never decrease'
);
update public.health_check_report_jobs
   set status = 'failed'
 where id = '63000000-0000-0000-0000-000000000001';
insert into health_test_context (key, value)
select 'report_expires_at', expires_at::text
  from public.health_check_report_jobs
 where id = '63000000-0000-0000-0000-000000000001';
set local session_replication_role = replica;
update public.health_check_sessions
   set expires_at = statement_timestamp() - interval '1 minute'
 where room_id = (select value::uuid from health_test_context where key = 'room_id');
update public.health_check_report_jobs
   set expires_at = statement_timestamp() - interval '1 minute'
 where id = '63000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set status = 'pending'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_is_expired',
  'expired failed outbox cannot be retried'
);
set local session_replication_role = replica;
update public.health_check_sessions
   set expires_at = (select value::timestamptz from health_test_context where key = 'report_expires_at')
 where room_id = (select value::uuid from health_test_context where key = 'room_id');
update public.health_check_report_jobs
   set expires_at = (select value::timestamptz from health_test_context where key = 'report_expires_at'),
       status = 'pending'
 where id = '63000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select extensions.ok(
  not (public.finalize_health_check((select value::uuid from health_test_context where key = 'room_id'))::text ~ 'recipient|nonce|encrypted'),
  'finalize response never returns recipient ciphertext or nonces'
);
select extensions.is(
  public.finalize_health_check((select value::uuid from health_test_context where key = 'room_id'))->>'job_id',
  '63000000-0000-0000-0000-000000000001',
  'repeated finalize returns the existing delivery job idempotently'
);
select extensions.is(
  public.finalize_health_check((select value::uuid from health_test_context where key = 'room_id'))->>'job_status',
  'pending',
  'repeated finalize returns the actual advanced job status'
);
reset role;
select extensions.is(
  (select count(*)::text from public.health_check_report_jobs where source_room_id = (select value::uuid from health_test_context where key = 'room_id')),
  '1',
  'repeated finalize never duplicates the outbox job'
);
select extensions.lives_ok(
  $$update public.health_check_report_jobs
       set status = 'processing', attempts = attempts + 1,
           claimed_by = 'delivery-worker',
           lease_expires_at = statement_timestamp() + interval '1 minute'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  'pending outbox can be claimed for processing'
);
select extensions.lives_ok(
  $$update public.health_check_report_jobs
       set status = 'sent', provider_message_id = 'provider-accepted',
           claimed_by = null, lease_expires_at = null
     where id = '63000000-0000-0000-0000-000000000001'$$,
  'processing outbox can become sent with a provider id'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set status = 'pending', provider_message_id = null
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_transition_is_invalid',
  'sent outbox cannot transition back to pending'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set provider_message_id = 'provider-replacement'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_provider_id_is_immutable',
  'provider message id can never be replaced'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set provider_message_id = null
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_provider_id_is_immutable',
  'provider message id can never be cleared'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set attempts = attempts - 1
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_attempts_cannot_decrease',
  'sent outbox attempts remain monotonic'
);
select extensions.throws_ok(
  $$update public.health_check_report_jobs
       set created_at = created_at + interval '1 second'
     where id = '63000000-0000-0000-0000-000000000001'$$,
  '23514', 'health_check_report_job_identity_is_immutable',
  'outbox creation timestamp is immutable'
);
set local session_replication_role = replica;
update public.health_check_report_jobs
   set status = 'pending', provider_message_id = null,
       claimed_by = null, lease_expires_at = null
 where id = '63000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
set local session_replication_role = replica;
update public.health_check_report_jobs
   set encrypted_recipient = decode(repeat('fe', 32), 'hex')
 where id = '63000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  format('select public.finalize_health_check(%L::uuid)', (select value from health_test_context where key = 'room_id')),
  null, 'health_check_report_job_invariant',
  'repeated finalize rejects a corrupted immutable recipient copy'
);
reset role;
set local session_replication_role = replica;
update public.health_check_report_jobs
   set encrypted_recipient = decode(repeat('ab', 32), 'hex')
 where id = '63000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
set local session_replication_role = replica;
update public.health_check_report_jobs
   set source_room_id = '00000000-0000-0000-0000-000000000005'
 where id = '63000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  format('select public.finalize_health_check(%L::uuid)', (select value from health_test_context where key = 'room_id')),
  null, 'health_check_report_job_invariant',
  'repeated finalize rejects a corrupted source room copy'
);
reset role;
set local session_replication_role = replica;
update public.health_check_report_jobs
   set source_room_id = (select value::uuid from health_test_context where key = 'room_id'),
       expires_at = expires_at + interval '1 minute'
 where id = '63000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select extensions.throws_ok(
  format('select public.finalize_health_check(%L::uuid)', (select value from health_test_context where key = 'room_id')),
  null, 'health_check_report_job_invariant',
  'repeated finalize rejects a corrupted expiry copy'
);
reset role;
set local session_replication_role = replica;
update public.health_check_report_jobs
   set expires_at = (select expires_at from public.health_check_sessions
                       where room_id = (select value::uuid from health_test_context where key = 'room_id'))
 where id = '63000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
reset role;
set local role service_role;
select extensions.is(
  public.create_health_check_room(
    '61000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000001', 'Ignored', 'Ignored', date '2026-08-27',
    '63000000-0000-0000-0000-000000000099', decode(repeat('cd', 32), 'hex'),
    decode(repeat('02', 12), 'hex'), 2
  )->>'status',
  'request_already_used',
  'completed health room permanently consumes its create request id'
);
reset role;

set local role service_role;
insert into health_test_context (key, value)
select 'abort_room', public.create_health_check_room(
  '61000000-0000-0000-0000-000000000009',
  '62000000-0000-0000-0000-000000000009', 'Abort Fac', 'Abort Squad', date '2026-08-26',
  '63000000-0000-0000-0000-000000000009', decode(repeat('ef', 32), 'hex'), decode(repeat('03', 12), 'hex'), 1
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
  '63000000-0000-0000-0000-000000000010', decode(repeat('11', 32), 'hex'), decode(repeat('04', 12), 'hex'), 1
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
      id, source_room_id, aad_room_id, encrypted_recipient, recipient_nonce,
      encryption_key_version, status, next_attempt_at, expires_at, idempotency_key
    ) values (
      '63000000-0000-0000-0000-000000000010', %1$L::uuid,
      '00000000-0000-0000-0000-000000000004',
      decode(repeat('11', 32), 'hex'), decode(repeat('04', 12), 'hex'),
      1, 'awaiting_materialization', now(),
      (select expires_at from public.health_check_sessions where room_id = %1$L::uuid),
      'health-check:63000000-0000-0000-0000-000000000010'
    )
  $sql$, (select value from health_test_context where key = 'cleanup_room')),
  '23514', 'health_check_report_job_source_mismatch',
  'outbox insert rejects AAD that differs from its source room'
);
select extensions.throws_ok(
  format($sql$
    insert into public.health_check_report_jobs (
      id, source_room_id, aad_room_id, encrypted_recipient, recipient_nonce,
      encryption_key_version, status, next_attempt_at, expires_at, idempotency_key
    ) values (
      '63000000-0000-0000-0000-000000000010', %1$L::uuid, %1$L::uuid,
      decode(repeat('11', 32), 'hex'), decode(repeat('04', 12), 'hex'),
      1, 'awaiting_materialization', now(),
      (select expires_at + interval '1 minute' from public.health_check_sessions where room_id = %1$L::uuid),
      'health-check:63000000-0000-0000-0000-000000000010'
    )
  $sql$, (select value from health_test_context where key = 'cleanup_room')),
  '23514', 'health_check_report_job_expiry_mismatch',
  'outbox insert rejects expiry later than its source health session'
);
insert into public.health_check_report_jobs (
  id, source_room_id, aad_room_id, encrypted_recipient, recipient_nonce,
  encryption_key_version, status, next_attempt_at, expires_at, idempotency_key
) values (
  '63000000-0000-0000-0000-000000000010',
  (select value::uuid from health_test_context where key = 'cleanup_room'),
  (select value::uuid from health_test_context where key = 'cleanup_room'),
  decode(repeat('11', 32), 'hex'), decode(repeat('04', 12), 'hex'),
  1, 'awaiting_materialization', now(),
  (select expires_at from public.health_check_sessions where room_id = (select value::uuid from health_test_context where key = 'cleanup_room')),
  'health-check:63000000-0000-0000-0000-000000000010'
);
set local session_replication_role = replica;
update public.health_check_sessions set expires_at = now() - interval '1 minute'
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
    '63000000-0000-0000-0000-000000000099', decode(repeat('22', 32), 'hex'),
    decode(repeat('06', 12), 'hex'), 1
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
select extensions.throws_ok(
  format('select public.finalize_health_check(%L::uuid)', (select value from health_test_context where key = 'cleanup_room')),
  '42501', 'facilitator_required',
  'expired health room cannot be finalized'
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
update public.health_check_report_jobs
   set status = 'processing', claimed_by = 'stale-worker',
       lease_expires_at = statement_timestamp() - interval '1 minute'
 where id = '63000000-0000-0000-0000-000000000001';
set local role service_role;
select private.cleanup_expired_health_checks();
reset role;
select extensions.results_eq(
  $$select status, claimed_by, lease_expires_at from public.health_check_report_jobs
     where id = '63000000-0000-0000-0000-000000000001'$$,
  $$values ('failed'::text, null::text, null::timestamptz)$$,
  'cleanup releases an expired processing lease as retryable failed state'
);
select extensions.is(
  (select count(*)::text from public.sessions where id = (select value::uuid from health_test_context where key = 'cleanup_room')),
  '0',
  'cleanup deletes expired health rooms through session cascade'
);
select extensions.is(
  (select count(*)::text from public.health_check_report_jobs where id = '63000000-0000-0000-0000-000000000010'),
  '0',
  'cleanup deletes expired durable outbox jobs'
);

select * from extensions.finish();
rollback;
