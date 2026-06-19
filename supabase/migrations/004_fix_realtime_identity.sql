-- Sørg for at UPDATE-events via Supabase Realtime inkluderer alle kolonner
-- (ikke bare de som faktisk endret seg).
-- REPLICA IDENTITY FULL er nødvendig for at payload.new alltid er komplett,
-- spesielt for kolonner som ble lagt til ETTER at Realtime ble konfigurert.
ALTER TABLE sessions REPLICA IDENTITY FULL;
ALTER TABLE participants REPLICA IDENTITY FULL;
ALTER TABLE votes REPLICA IDENTITY FULL;
