-- Estimeringsapp: Initial database schema
-- Kjør: supabase db push (eller via Supabase Dashboard SQL Editor)

-- =============================================================
-- TABELLER
-- =============================================================

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  current_round INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('facilitator', 'participant')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  size TEXT NOT NULL CHECK (size IN ('xs', 's', 'm', 'l', 'xl')),
  value TEXT NOT NULL CHECK (value IN ('gold', 'silver', 'bronze')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(participant_id, round)
);

-- =============================================================
-- INDEKSER
-- =============================================================

CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_participants_session ON participants(session_id);
CREATE INDEX idx_votes_session_round ON votes(session_id, round);

-- =============================================================
-- ROW LEVEL SECURITY (åpne policyer for MVP – intern app)
-- =============================================================

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alle kan lese og skrive sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Alle kan lese og skrive participants" ON participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Alle kan lese og skrive votes" ON votes FOR ALL USING (true) WITH CHECK (true);

-- =============================================================
-- REALTIME
-- =============================================================
-- Aktiver realtime på alle tabeller som trenger live-oppdateringer

ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE votes;
