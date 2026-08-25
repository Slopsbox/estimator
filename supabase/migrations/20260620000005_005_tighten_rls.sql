-- ============================================================
-- 005_tighten_rls.sql
-- Erstatter de åpne ALL-policyene med operasjonsspesifikke policyer.
-- Uten autentisering kan vi ikke gjøre person-spesifikk RLS,
-- men vi kan begrense HVILKE operasjoner som er tillatt:
--   - Ingen kan DELETE sessions, participants eller votes
--   - Votes er INSERT-only (ingen UPDATE, ingen DELETE)
-- ============================================================

-- Fjern de åpne policyene fra initial schema
DROP POLICY IF EXISTS "Alle kan lese og skrive sessions" ON sessions;
DROP POLICY IF EXISTS "Alle kan lese og skrive participants" ON participants;
DROP POLICY IF EXISTS "Alle kan lese og skrive votes" ON votes;

-- ============================================================
-- SESSIONS
-- ============================================================

-- Alle kan lese aktive sesjoner (brukes ved join via join_code)
CREATE POLICY "Alle kan lese sessions"
  ON sessions FOR SELECT USING (true);

-- Alle kan opprette nye sesjoner
CREATE POLICY "Alle kan opprette sessions"
  ON sessions FOR INSERT WITH CHECK (true);

-- Alle kan oppdatere sesjoner (fasilitatorkontroll skjer i app-logikk)
-- For MVP uten auth: begrenses til operasjonsnivå, ikke person-nivå
CREATE POLICY "Alle kan oppdatere sessions"
  ON sessions FOR UPDATE USING (true) WITH CHECK (true);

-- Ingen DELETE-policy for sessions → ingen kan slette sesjoner

-- ============================================================
-- PARTICIPANTS
-- ============================================================

-- Alle kan lese deltakere i en sesjon
CREATE POLICY "Alle kan lese participants"
  ON participants FOR SELECT USING (true);

-- Alle kan registrere seg som deltaker
CREATE POLICY "Alle kan registrere seg som participant"
  ON participants FOR INSERT WITH CHECK (true);

-- Alle kan oppdatere sin egen deltaker-rad (navn etc.)
-- Person-spesifikk begrensning via app-logikk (deltaker-ID fra sessionStorage)
CREATE POLICY "Kan oppdatere egen participant"
  ON participants FOR UPDATE USING (true) WITH CHECK (true);

-- Ingen DELETE-policy for participants → ingen kan slette deltakere

-- ============================================================
-- VOTES
-- ============================================================

-- Alle kan lese stemmer (brukes ved reveal)
CREATE POLICY "Alle kan lese votes"
  ON votes FOR SELECT USING (true);

-- Alle kan legge til stemmer (INSERT-only)
CREATE POLICY "Alle kan stemme"
  ON votes FOR INSERT WITH CHECK (true);

-- Ingen UPDATE-policy for votes → stemmer kan ikke endres etter avgivelse
-- Ingen DELETE-policy for votes → stemmer kan ikke slettes (hindrer sabotasje)
