-- Read-only preflight. Do not modify migration history from this file.
select version, name from supabase_migrations.schema_migrations order by version;

select to_regclass('public.sessions') as sessions,
       to_regclass('public.participants') as participants,
       to_regclass('public.votes') as votes;

select extname from pg_extension where extname in ('pg_cron', 'pgcrypto') order by extname;

-- 006 must match exactly: integer, NOT NULL, default 0.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sessions'
  and column_name = 'consensus_streak';

-- 007 must include both pg_cron and this exact scheduled job.
select jobname, schedule, command, active
from cron.job
where jobname = 'cleanup-old-sessions'
  and schedule = '0 3 * * *'
  and command = $$DELETE FROM sessions WHERE status = 'completed' AND created_at < now() - interval '7 days'$$;

-- 008 must include the named unique constraint and participant DELETE policy.
select c.conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'participants'
  and c.conname = 'unique_participant_name_per_session';

select policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'participants'
  and policyname = 'Kan slette participants';

-- 009 must include the vote DELETE policy.
select policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'votes'
  and policyname = 'Kan slette egne votes';

select policyname, tablename from pg_policies
where schemaname = 'public' and tablename in ('sessions', 'participants', 'votes')
order by tablename, policyname;

select count(*) as cross_session_votes
from public.votes v
join public.participants p on p.id = v.participant_id
where p.session_id <> v.session_id;
