-- Legg til sesjonskode og reveal-mekanisme
ALTER TABLE sessions ADD COLUMN join_code TEXT UNIQUE;
ALTER TABLE sessions ADD COLUMN votes_revealed BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for oppslag på join_code
CREATE INDEX idx_sessions_join_code ON sessions(join_code);
