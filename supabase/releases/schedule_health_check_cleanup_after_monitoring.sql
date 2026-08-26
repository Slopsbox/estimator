-- Optional release step. Do not run until the heartbeat table, monitored
-- wrapper and watchdog described in docs/architecture/squad-health-check.md
-- are implemented and owned by the named operations owner.
-- Roll back with rollback_health_check_cleanup_monitoring.sql before the core
-- rollback. Until monitoring has its own migration, that rollback unschedules
-- and then refuses to remove wrapper/table objects it cannot prove it owns.
begin;

do $preflight$
begin
  if to_regprocedure('private.run_health_check_cleanup_with_heartbeat()') is null
     or to_regclass('private.retention_job_heartbeats') is null then
    raise exception 'Health cleanup scheduling requires heartbeat wrapper and table';
  end if;
  if not exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    raise exception 'Health cleanup scheduling requires pg_cron';
  end if;
end;
$preflight$;

do $schedule$
declare
  v_existing_job_id bigint;
begin
  select jobid into v_existing_job_id
    from cron.job
   where jobname = 'cleanup-expired-health-checks';

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  perform cron.schedule(
    'cleanup-expired-health-checks',
    '*/5 * * * *',
    'select private.run_health_check_cleanup_with_heartbeat()'
  );
end;
$schedule$;

commit;
