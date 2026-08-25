// ============================================================
// Delte TypeScript-typer for estimeringsappen
// ============================================================
// DB-Row-typer er generert fra Supabase-skjemaet.
// Importer database.types.ts ved hjelp av Tables<...> helper-typen.
// App-nivå utility-typer defineres her.
// ============================================================

import type { Tables } from './database.types';

// ============================================================
// Re-eksport av genererte DB-typer
// ============================================================

/** Rad fra sessions-tabellen */
export type Session = Omit<Tables<'sessions'>, 'facilitator_user_id' | 'create_request_id'>;

/** Rad fra participants-tabellen */
export type Participant = Omit<Tables<'participants'>, 'user_id'>;

/** Rad fra votes-tabellen */
export type Vote = Tables<'votes'>;

/** Rad fra round_participants-tabellen */
export type RoundParticipant = Tables<'round_participants'>;

// ============================================================
// App-nivå narrowing-typer (snevrere enn DB-typens `string`)
// Disse speiler CHECK-constraints i skjemaet og brukes i app-logikk.
// ============================================================

/** Mulige størrelsesestimater (speiler CHECK-constraint i DB) */
export type Size = 'xs' | 's' | 'm' | 'l' | 'xl';

/** Forretningsverdi-rangering (speiler CHECK-constraint i DB) */
export type Value = 'gold' | 'silver' | 'bronze';

/** Sesjonstatus (speiler CHECK-constraint i DB) */
export type SessionStatus = 'active' | 'completed';

/** Deltaker-rolle (speiler CHECK-constraint i DB) */
export type ParticipantRole = 'facilitator' | 'participant';

// ============================================================
// Frontend-spesifikke typer (ingen DB-ekvivalent)
// ============================================================

/** Versjonert lokal peker. Rolle og navn er kun cache frem til restore-RPC svarer. */
export interface SessionPointer {
  version: 1;
  updatedAt?: string;
  participantId: string;
  sessionId: string;
  name: string;
  role: ParticipantRole;
}

/** Autoritativ deltakeridentitet i aktiv app-state. */
export type LocalParticipant = Omit<SessionPointer, 'version'>;

/** Props for stemme-komponent */
export interface VoteSubmission {
  size: Size;
  value: Value;
}
