-- Legg til started-flagg for å støtte eksplisitt oppstart av sesjon
ALTER TABLE sessions ADD COLUMN started BOOLEAN NOT NULL DEFAULT FALSE;
