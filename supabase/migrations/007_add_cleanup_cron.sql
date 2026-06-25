-- ============================================================
-- Migrasjon 007: Automatisk opprydding av gamle sesjoner
-- ============================================================
--
-- MERK: Denne migrasjonen MÅ kjøres manuelt i Supabase Dashboard
--       SQL Editor (https://app.supabase.com → SQL Editor).
--       pg_cron er tilgjengelig på Supabase Pro+, men krever at
--       extensionen er aktivert i prosjektets database-innstillinger
--       (Database → Extensions → pg_cron).
--
--       Supabase CLI (supabase db push) støtter ikke pg_cron direkte
--       fordi det krever superuser-tilgang og IPv6-tilkoblingen er
--       ustabil fra lokalt utviklingsmiljø (kjent problem, se minne).
--
-- Hva dette gjør:
--   - Sletter sessions med status='completed' eldre enn 7 dager
--   - participants og votes slettes automatisk via CASCADE (se migrasjon 001)
--   - Kjøres kl. 03:00 UTC hver dag (minimalt trafikk-tidspunkt)
--
-- Alternativ hvis pg_cron ikke er tilgjengelig:
--   - Bruk en Supabase Edge Function med cron-trigger (se kommentar under)
-- ============================================================

-- Aktiver pg_cron extension (krever Supabase Pro+)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Planlegg daglig opprydding kl. 03:00 UTC
-- Deltakere og stemmer slettes automatisk via CASCADE
SELECT cron.schedule(
  'cleanup-old-sessions',
  '0 3 * * *',
  $$DELETE FROM sessions WHERE status = 'completed' AND created_at < now() - interval '7 days'$$
);

-- ============================================================
-- ALTERNATIV: Supabase Edge Function (hvis pg_cron ikke er tilgjengelig)
-- ============================================================
-- Opprett en Edge Function i supabase/functions/cleanup-sessions/index.ts:
--
--   import { createClient } from '@supabase/supabase-js';
--   const supabase = createClient(
--     Deno.env.get('SUPABASE_URL')!,
--     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
--   );
--   Deno.serve(async () => {
--     const { error } = await supabase
--       .from('sessions')
--       .delete()
--       .eq('status', 'completed')
--       .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
--     return new Response(error ? 'error' : 'ok');
--   });
--
-- Sett opp cron-trigger i Supabase Dashboard:
--   Project Settings → Edge Functions → Cron → "0 3 * * *"
-- ============================================================
