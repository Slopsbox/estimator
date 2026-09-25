import { createContext } from 'react';
import type { LocalParticipant, RoomActivityType, RoundParticipant, Session, Vote, VoteSubmission } from '../lib/types';

export type RestoreStatus = 'initializing' | 'ready' | 'reconnecting' | 'invalid';
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';
export type MutationResult = { ok: true } | { ok: false; message: string };
export type JoinResult = { ok: true; activityType: RoomActivityType } | { ok: false; reason: 'session_not_found' | 'role_conflict' | 'membership_removed' | 'active_session_exists' | 'transient' };

export interface SessionContextValue {
  session: Session | null;
  activityType: RoomActivityType | null;
  localParticipant: LocalParticipant | null;
  ownVote: Vote | null;
  roundParticipant: RoundParticipant | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  restoreStatus: RestoreStatus;
  connectionState: ConnectionState;
  createSession: (name: string, replaceActive?: boolean) => Promise<Session | null>;
  createHealthCheck: (name: string, squadName: string, measurementDate: string, replaceActive?: boolean) => Promise<Session | null>;
  joinSession: (code: string, name: string, replaceActive?: boolean) => Promise<JoinResult>;
  startSession: () => Promise<MutationResult>;
  revealVotes: () => Promise<MutationResult>;
  nextRound: () => Promise<MutationResult>;
  endSession: () => Promise<MutationResult>;
  leaveSession: () => Promise<MutationResult>;
  claimRound: () => Promise<MutationResult>;
  castVote: (vote: VoteSubmission) => Promise<MutationResult>;
  retractVote: () => Promise<MutationResult>;
  deactivateParticipant: (participantId: string) => Promise<MutationResult>;
  retryRestore: () => Promise<void>;
  clearLocalSession: () => void;
  /** Clears only the local app pointer. It does not leave the database membership. */
  logout: () => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);
