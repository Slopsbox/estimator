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

/** Rad fra participants-tabellen */
export type Participant = Omit<Tables<'participants'>, 'user_id' | 'active_room_user_id' | 'removed_at'>;

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

/** Aktivitet som kjøres i et felles rom. */
export type RoomActivityType = 'estimation' | 'health_check';

/** Offentlig session-rad med aktivitet snevret til databasekontrakten. */
export type Session = Omit<
  Tables<'sessions'>,
  'facilitator_user_id' | 'create_request_id' | 'activity_type'
> & { activity_type: RoomActivityType };

// ============================================================
// Frontend-spesifikke typer (ingen DB-ekvivalent)
// ============================================================

/** Versjonert lokal peker. Rolle og navn er kun cache frem til restore-RPC svarer. */
export interface SessionPointer {
  version: 2;
  activityType: RoomActivityType;
  updatedAt?: string;
  participantId: string;
  sessionId: string;
  name: string;
  role: ParticipantRole;
}

/** Autoritativ deltakeridentitet i aktiv app-state. */
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
