# Production migration reconciliation

Production migration history stops at `005`, while effects from `006`-`009` may already exist. Do not edit those historical files and do not run repair automatically.

1. Run `production_migration_reconciliation.sql` read-only and require an exact match for every effect from `006`-`009`: `consensus_streak` type/nullability/default, the `pg_cron` extension and exact `cleanup-old-sessions` schedule/command, the named participant uniqueness constraint, and both named DELETE policies.
2. Back up the database and record the exact reviewed versions.
3. If and only if every migration effect is present, mark each version applied with `supabase migration repair <version> --status applied` in a controlled maintenance window.
4. Re-run `supabase migration list` and the preflight before any `db push`.

Never run `migration repair` for a partial, renamed, differently configured, or inferred match. The command above is documentation only and has never been run for this repository.
