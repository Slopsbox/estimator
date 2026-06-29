-- ============================================================
-- Migrasjon 008: Unik deltaker per sesjon + rydde-policy
-- ============================================================
--
-- MERK: Denne migrasjonen MÅ kjøres manuelt i Supabase Dashboard
--       SQL Editor (https://app.supabase.com → SQL Editor).
--
--       Supabase CLI (supabase db push) støtter ikke direkte
--       tilkobling fordi IPv6-tilkoblingen er ustabil fra lokalt
--       utviklingsmiljø (kjent problem, se minne).
--
-- Hva dette gjør:
--   1. Fjerner eventuelle duplikater (behold eldste per session+name)
--   2. Legger til UNIQUE constraint på (session_id, name) i participants
--   3. Legger til DELETE-policy så fasilitator kan rydde duplikater
--
-- Bakgrunn:
--   - Hver refresh kan opprette ny participant-rad for samme navn
--   - Løsningen her er backend-sikring (constraint) i tillegg til
--     upsert-logikk i useSession.joinSession (sjekker eksisterende)
--   - Fasilitator kan rydde duplikater via "Rydd opp"-knapp i Dashboard
-- ============================================================

-- ── Steg 1: Fjern duplikater ──────────────────────────────────
-- Behold den ELDSTE raden per (session_id, name).
-- Duplikatene (nyere joined_at) slettes.
DELETE FROM participants a
USING participants b
WHERE a.session_id = b.session_id
  AND a.name = b.name
  AND a.joined_at > b.joined_at;

-- ── Steg 2: Unik constraint ───────────────────────────────────
ALTER TABLE participants
  ADD CONSTRAINT unique_participant_name_per_session
  UNIQUE (session_id, name);

-- ── Steg 3: DELETE-policy for opprydding ──────────────────────
-- Tillater sletting av participants (for Rydd opp-knappen).
-- RLS er aktivert på tabellen (se migrasjon 005).
CREATE POLICY "Kan slette participants"
  ON participants
  FOR DELETE
  USING (true);
