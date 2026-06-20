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
export type Session = Tables<'sessions'>;

/** Rad fra participants-tabellen */
export type Participant = Tables<'participants'>;

/** Rad fra votes-tabellen */
export type Vote = Tables<'votes'>;

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
