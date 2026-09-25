-- `supabase test db --local supabase/tests/participant_continuity_test.sql`
begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(28);

insert into auth.users (id, aud, role, created_at, updated_at)
values
  ('71000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', now(), now()),
  ('71000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', now(), now()),
  ('71000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', now(), now()),
  ('71000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', now(), now());

insert into private.turnstile_attestations (user_id, verified_until)
select id, clock_timestamp() + interval '15 minutes'
  from auth.users
 where id between '71000000-0000-0000-0000-000000000001'::uuid
              and '71000000-0000-0000-0000-000000000004'::uuid;

create temporary table continuity_context (key text primary key, value text not null);
grant all on continuity_context to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
insert into continuity_context
select 'room_a', public.create_session(
  '72000000-0000-0000-0000-000000000001', 'Facilitator A'
)->'session'->>'id';
insert into continuity_context
select 'code_a', join_code from public.sessions
 where id = (select value::uuid from continuity_context where key = 'room_a');

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
insert into continuity_context
select 'room_b', public.create_session(
  '72000000-0000-0000-0000-000000000002', 'Facilitator B'
)->'session'->>'id';
insert into continuity_context
select 'code_b', join_code from public.sessions
 where id = (select value::uuid from continuity_context where key = 'room_b');

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
insert into continuity_context
select 'join_a', public.join_session(
  (select value from continuity_context where key = 'code_a'), 'Participant'
)::text;
insert into continuity_context
select 'participant_a', value::jsonb->'participant'->>'id'
  from continuity_context where key = 'join_a';

select extensions.is(
  public.join_session(
    (select value from continuity_context where key = 'code_a'), 'Participant renamed'
  )->'participant'->>'id',
  (select value from continuity_context where key = 'participant_a'),
  'same-room rejoin remains idempotent'
);

select extensions.ok(
  not ((public.restore_session(
    (select value::uuid from continuity_context where key = 'room_a')
  )->'participant') ?| array['user_id', 'active_room_user_id', 'removed_at'])
  and not (((select value::jsonb->'participant'
               from continuity_context where key = 'join_a'))
             ?| array['user_id', 'active_room_user_id', 'removed_at']),
  'join and restore responses hide internal identity and continuity columns'
);

select extensions.ok(
  not ((public.create_session(
    '72000000-0000-0000-0000-000000000001', 'Ignored retry name'
  )->'participant') ?| array['user_id', 'active_room_user_id', 'removed_at']),
  'idempotent create responses hide internal identity and continuity columns'
);

select extensions.results_eq(
  $$select count(*)::integer, count(active_room_user_id)::integer
      from public.participants
     where user_id = '71000000-0000-0000-0000-000000000003'$$,
  $$values (1, 1)$$,
  'same-room rejoin retains one membership and one active marker'
);

select extensions.is(
  public.join_session(
    (select value from continuity_context where key = 'code_b'), 'Participant'
  )->>'status',
  'active_session_exists',
  'joining a different room without replacement returns a typed conflict'
);

select extensions.results_eq(
  format(
    'select session_id, left_at is null from public.participants where id = %L::uuid',
    (select value from continuity_context where key = 'participant_a')
  ),
  format(
    'values (%L::uuid, true)',
    (select value from continuity_context where key = 'room_a')
  ),
  'a rejected switch leaves the original active membership unchanged'
);

select extensions.ok(
  (select count(*) = 1
     from public.participants
    where active_room_user_id = '71000000-0000-0000-0000-000000000003'),
  'the unique marker exposes exactly one final active room after a conflict'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select public.start_session((select value::uuid from continuity_context where key = 'room_a'));

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
select public.cast_vote(
  (select value::uuid from continuity_context where key = 'room_a'), 1, 'm', 'gold'
);
select public.retract_vote(
  (select value::uuid from continuity_context where key = 'room_a'), 1
);
select extensions.is(
  (select reestimate_used::text from public.round_participants
    where session_id = (select value::uuid from continuity_context where key = 'room_a')
      and round = 1
      and participant_id = (select value::uuid from continuity_context where key = 'participant_a')),
  'true',
  'the once-per-round reestimate flag is set before leaving'
);

select extensions.is(
  public.join_session(
    (select value from continuity_context where key = 'code_b'), 'Participant', true
  )->>'status',
  'ok',
  'explicit replacement atomically leaves the old room and joins the target'
);

select extensions.ok(
  (select left_at is not null and active_room_user_id is null
     from public.participants
    where id = (select value::uuid from continuity_context where key = 'participant_a'))
  and (select count(*) = 1
         from public.participants
        where active_room_user_id = '71000000-0000-0000-0000-000000000003'),
  'replacement leaves one final active membership'
);

select extensions.is(
  public.join_session(
    (select value from continuity_context where key = 'code_a'), 'Participant returned', true
  )->>'status',
  'ok',
  'explicit replacement can return to a previously left estimation room'
);

select extensions.is(
  (select reestimate_used::text from public.round_participants
    where session_id = (select value::uuid from continuity_context where key = 'room_a')
      and round = 1
      and participant_id = (select value::uuid from continuity_context where key = 'participant_a')),
  'true',
  'leave and rejoin preserve reestimate_used'
);

select public.cast_vote(
  (select value::uuid from continuity_context where key = 'room_a'), 1, 'l', 'silver'
);
select extensions.throws_ok(
  format(
    'select public.retract_vote(%L::uuid, 1)',
    (select value from continuity_context where key = 'room_a')
  ),
  null,
  'reestimate_unavailable',
  'leave and rejoin cannot reset the once-per-round retract rule'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select extensions.is(
  public.deactivate_estimation_participant(
    (select value::uuid from continuity_context where key = 'room_a'),
    (select value::uuid from continuity_context where key = 'participant_a')
  )->>'status',
  'deactivated',
  'the facilitator can deactivate a stale estimation participant'
);

select extensions.ok(
  exists (
    select 1 from public.votes
     where session_id = (select value::uuid from continuity_context where key = 'room_a')
       and participant_id = (select value::uuid from continuity_context where key = 'participant_a')
       and round = 1
  ) and exists (
    select 1 from public.round_participants
     where session_id = (select value::uuid from continuity_context where key = 'room_a')
       and participant_id = (select value::uuid from continuity_context where key = 'participant_a')
       and round = 1
  ),
  'facilitator deactivation retains historical votes and round membership'
);

select extensions.is(
  (select left_at is not null and removed_at is not null and active_room_user_id is null
     from public.participants
    where id = (select value::uuid from continuity_context where key = 'participant_a'))::text,
  'true',
  'deactivation marks the membership removed and inactive'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
select extensions.is(
  public.join_session(
    (select value from continuity_context where key = 'code_a'), 'Removed participant'
  )->>'status',
  'membership_removed',
  'a removed participant cannot reactivate the same room membership'
);

select extensions.throws_ok(
  format(
    'select public.cast_vote(%L::uuid, 1, %L, %L)',
    (select value from continuity_context where key = 'room_a'), 's', 'bronze'
  ),
  '42501',
  'session_not_available',
  'a removed participant cannot perform current-round actions'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select extensions.is(
  (select jsonb_array_length(public.get_round_vote_statuses(
    (select value::uuid from continuity_context where key = 'room_a'), 1
  ))::text),
  '0',
  'deactivated participants are excluded from current-round pending status'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
select extensions.is(
  public.create_health_check_room_prototype(
    '72000000-0000-0000-0000-000000000003', 'Participant', 'Blocked squad',
    current_date, '73000000-0000-0000-0000-000000000003'
  )->>'status',
  'active_session_exists',
  'an active room blocks silent creation across roles and activity types'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
insert into continuity_context
select 'health_takeover', public.create_health_check_room_prototype(
  '72000000-0000-0000-0000-000000000011', 'Facilitator A', 'Replacement squad',
  current_date, '73000000-0000-0000-0000-000000000011', true
)::text;

select extensions.is(
  (select value::jsonb->>'status' from continuity_context where key = 'health_takeover'),
  'ok',
  'facilitator takeover completes the old estimation and creates the health room atomically'
);

select extensions.results_eq(
  format(
    'select status from public.sessions where id = %L::uuid',
    (select value from continuity_context where key = 'room_a')
  ),
  $$values ('completed'::text)$$,
  'facilitator takeover ends the previous estimation without deleting history'
);

select extensions.is(
  (select count(*)::text from public.participants
    where active_room_user_id = '71000000-0000-0000-0000-000000000001'),
  '1',
  'facilitator takeover has one final active-room marker'
);

reset role;
set local role service_role;
insert into continuity_context
select 'expired_health', public.create_health_check_room(
  '71000000-0000-0000-0000-000000000004',
  '72000000-0000-0000-0000-000000000004', 'Expiry facilitator', 'Expiry squad',
  current_date, '73000000-0000-0000-0000-000000000004'
)->'session'->>'id';
reset role;

set local session_replication_role = replica;
update public.health_check_sessions
   set expires_at = clock_timestamp() - interval '1 minute'
 where room_id = (select value::uuid from continuity_context where key = 'expired_health');
set local session_replication_role = origin;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000004', true);
insert into continuity_context
select 'after_expiry', public.create_session(
  '72000000-0000-0000-0000-000000000014', 'Expiry facilitator'
)::text;

select extensions.is(
  (select value::jsonb->>'status' from continuity_context where key = 'after_expiry'),
  'ok',
  'an expired health room does not block replacement creation without cron'
);

select extensions.results_eq(
  format(
    'select status from public.sessions where id = %L::uuid',
    (select value from continuity_context where key = 'expired_health')
  ),
  $$values ('completed'::text)$$,
  'lazy expiry retires the stale health session without deleting its graph'
);

select extensions.ok(
  (select count(*) = 1
     from public.participants
    where active_room_user_id = '71000000-0000-0000-0000-000000000004'),
  'expiry replacement ends with exactly one active membership marker'
);

select extensions.ok(
  to_regprocedure('public.create_session(uuid,text)') is null
  and to_regprocedure('public.join_session(text,text)') is null
  and exists (
    select 1
      from pg_index index_metadata
      join pg_class index_relation on index_relation.oid = index_metadata.indexrelid
     where index_relation.oid = 'public.participants_one_active_room_per_user_uidx'::regclass
       and index_metadata.indisunique
       and index_metadata.indpred is not null
  )
  and has_function_privilege(
    'authenticated', 'public.deactivate_estimation_participant(uuid,uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.deactivate_estimation_participant(uuid,uuid)', 'EXECUTE'
  ),
  'legacy signatures are removed and deactivation grants remain least privilege'
);

select extensions.ok(
  (select prosecdef and proconfig @> array['search_path=pg_catalog']
     from pg_proc
    where oid = 'public.deactivate_estimation_participant(uuid,uuid)'::regprocedure)
  and (select prosecdef and proconfig @> array['search_path=pg_catalog']
         from pg_proc
        where oid = 'private.prepare_active_room_transition(uuid,uuid,boolean)'::regprocedure),
  'new privileged functions retain SECURITY DEFINER and fixed search_path'
);

select * from extensions.finish();
rollback;
