// ============================================================
// Delte TypeScript-typer for estimeringsappen
// Speiler datamodellen definert i oppdraget
// ============================================================

/** Mulige størrelsesestimater */
export type Size = 'xs' | 's' | 'm' | 'l' | 'xl';

/** Forretningsverdi-rangering */
export type Value = 'gold' | 'silver' | 'bronze';

/** Sesjonstatus */
export type SessionStatus = 'active' | 'completed';

/** Deltaker-rolle */
export type ParticipantRole = 'facilitator' | 'participant';

// ============================================================
// Database-modeller (speiler Supabase-tabellene)
// ============================================================

export interface Session {
  id: string;
  status: SessionStatus;
  current_round: number;
  created_at: string;
}

export interface Participant {
  id: string;
  session_id: string;
  name: string;
  role: ParticipantRole;
  joined_at: string;
}

export interface Vote {
  id: string;
  session_id: string;
  participant_id: string;
  round: number;
  size: Size;
  value: Value;
  created_at: string;
}

// ============================================================
// Frontend-spesifikke typer
// ============================================================

/** Lokal tilstand for en deltaker (lagres i sessionStorage) */
export interface LocalParticipant {
  participantId: string;
  sessionId: string;
  name: string;
  role: ParticipantRole;
}

/** Props for stemme-komponent */
export interface VoteSubmission {
  size: Size;
  value: Value;
}
