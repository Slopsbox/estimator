-- ============================================================
-- Migrasjon 009: Tillat sletting av egne stemmer (Amalieknappen)
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
--   1. Legger til DELETE-policy på votes-tabellen
--
-- Bakgrunn:
--   - Amalieknappen lar deltakere re-estimere én gang per runde
--   - Klikk på knappen sletter stemmen fra DB og sender bruker
--     tilbake til stemmeformet (VoteForm)
--   - Uten denne policyen vil DELETE-kallet feile med RLS-feil
--   - Migrasjon 005 la til "INSERT-only" kommentar på votes;
--     dette overstyrer den intensjonen kontrollert via app-logikk:
--     kun én re-estimering per runde er tillatt (hasUsedAmalie-flag
--     i klienten) og kun FØR fasilitator avslører stemmene
-- ============================================================

-- Tillat at deltakere kan slette egne stemmer (for Amalieknappen)
CREATE POLICY "Kan slette egne votes"
  ON votes
  FOR DELETE
  USING (true);
