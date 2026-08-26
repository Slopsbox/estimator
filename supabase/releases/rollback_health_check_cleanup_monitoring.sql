-- Companion rollback for the optional health cleanup schedule. The monitoring
-- wrapper/table are not owned by a migration yet, so this file only unschedules
-- the job and then refuses to claim that those future objects were removed.
begin;

do $unschedule$
declare
  v_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    select jobid into v_job_id from cron.job
     where jobname = 'cleanup-expired-health-checks';
    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;
  end if;
end;
$unschedule$;

commit;

do $verify_monitoring_objects$
begin
  if to_regprocedure('private.run_health_check_cleanup_with_heartbeat()') is not null
     or to_regclass('private.retention_job_heartbeats') is not null then
    raise exception 'Health cleanup schedule removed, but monitoring objects remain. Remove them with their future ownership migration rollback before core rollback';
  end if;
end;
$verify_monitoring_objects$;
