import type {
  LocalParticipant,
  Participant,
  RoomActivityType,
  RoundParticipant,
  Session,
  SessionPointer,
  Vote,
} from '../../lib/types';
import type { Database } from '../../lib/database.types';
import type { RpcClient } from '../../platform/supabase/rpcClient';
import {
  hasOwn,
  isRecord,
  parseParticipant,
  parseRoundParticipant,
  parseSession,
  parseVote,
} from '../../platform/supabase/rpcRowParsers';

type PublicFunctions = Database['public']['Functions'];

export interface RoomMembershipStorage {
  writeSessionPointer(pointer: SessionPointer): void;
  clearCreateRequestId(): void;
  writeLastUsedName(name: string): void;
}

export interface RoomMembershipSnapshot {
  session: Session;
  participant: Participant;
  localParticipant: LocalParticipant;
  pointer: SessionPointer;
  activityType: RoomActivityType;
  /** Legacy compatibility until membership and estimation DB RPCs are split. */
  ownVote: Vote | null;
  /** Legacy compatibility until membership and estimation DB RPCs are split. */
  roundParticipant: RoundParticipant | null;
}

type ServiceFailure = 'identity' | 'rpc' | 'malformed';
export type CreateRoomResult = { ok: true; snapshot: RoomMembershipSnapshot }
  | { ok: false; reason: ServiceFailure };
export type JoinRoomResult = { ok: true; snapshot: RoomMembershipSnapshot }
  | { ok: false; reason: ServiceFailure | 'session_not_found' | 'role_conflict' };
export type RestoreRoomResult = { ok: true; snapshot: RoomMembershipSnapshot }
  | { ok: false; reason: ServiceFailure | 'membership_missing' | 'session_completed' };
export type LeaveRoomResult = { ok: true } | { ok: false; reason: ServiceFailure };

function isActivityType(value: unknown): value is RoomActivityType {
  return value === 'estimation' || value === 'health_check';
}

function parseMembership(value: unknown): RoomMembershipSnapshot | null {
  if (!isRecord(value) || (value.status !== 'ok' && value.status !== 'active_session_exists')) return null;
  if (!isRecord(value.session)) return null;
  const sessionRecord = value.session;
  const session = parseSession(sessionRecord);
  const participant = parseParticipant(value.participant);
  const hasEnvelopeActivityType = hasOwn(value, 'activity_type');
  if (
    (hasEnvelopeActivityType && !isActivityType(value.activity_type))
    || (hasEnvelopeActivityType && value.activity_type !== session?.activity_type)
  ) return null;

  if (!session || !participant || participant.session_id !== session.id) return null;
  const activityType = session.activity_type;
  if (activityType !== 'estimation' && (
    (hasOwn(value, 'round_participant') && value.round_participant != null)
    || (hasOwn(value, 'vote') && value.vote != null)
  )) return null;
  if (activityType === 'estimation' && (
    (hasOwn(value, 'round_participant') && value.round_participant != null && !parseRoundParticipant(value.round_participant))
    || (hasOwn(value, 'vote') && value.vote != null && !parseVote(value.vote))
  )) return null;
  const roundParticipant = parseRoundParticipant(value.round_participant);
  if (roundParticipant && (
      roundParticipant.session_id !== session.id
      || roundParticipant.participant_id !== participant.id
      || roundParticipant.round !== session.current_round
  )) return null;
  const ownVote = parseVote(value.vote);
  if (ownVote && (
      ownVote.session_id !== session.id
      || ownVote.participant_id !== participant.id
      || ownVote.round !== session.current_round
  )) return null;

  const localParticipant: LocalParticipant = {
    participantId: participant.id,
    sessionId: participant.session_id,
    name: participant.name,
    role: participant.role as LocalParticipant['role'],
  };
  return {
    session,
    participant,
    localParticipant,
    pointer: { version: 2, activityType, ...localParticipant },
    activityType,
    ownVote,
    roundParticipant,
  };
}

export function createRoomMembershipService({
  rpc,
  ensureIdentity,
  storage,
}: {
  rpc: RpcClient;
  ensureIdentity: () => Promise<unknown>;
  storage: RoomMembershipStorage;
}) {
  async function identityFailure(): Promise<boolean> {
    try {
      await ensureIdentity();
      return false;
    } catch {
      return true;
    }
  }

  async function membershipRpc<Name extends keyof PublicFunctions>(
    name: Name,
    args: PublicFunctions[Name]['Args'],
  ): Promise<{ data: unknown } | { reason: ServiceFailure }> {
    if (await identityFailure()) return { reason: 'identity' };
    try {
      const result = await rpc.rpc(name, args);
      return result.error ? { reason: 'rpc' } : { data: result.data };
    } catch {
      return { reason: 'rpc' };
    }
  }

  return {
    async create(name: string, requestId: string): Promise<CreateRoomResult> {
      const result = await membershipRpc('create_session', {
        p_request_id: requestId,
        p_facilitator_name: name.trim(),
      });
      if ('reason' in result) return { ok: false, reason: result.reason };
      const snapshot = parseMembership(result.data);
      return snapshot ? { ok: true, snapshot } : { ok: false, reason: 'malformed' };
    },

    async join(code: string, name: string): Promise<JoinRoomResult> {
      const result = await membershipRpc('join_session', {
        p_join_code: code.trim().toUpperCase(),
        p_name: name.trim(),
      });
      if ('reason' in result) return { ok: false, reason: result.reason };
      if (isRecord(result.data) && (result.data.status === 'session_not_found' || result.data.status === 'role_conflict')) {
        return { ok: false, reason: result.data.status };
      }
      const snapshot = parseMembership(result.data);
      return snapshot ? { ok: true, snapshot } : { ok: false, reason: 'malformed' };
    },

    async restore(sessionId: string): Promise<RestoreRoomResult> {
      const result = await membershipRpc('restore_session', { p_session_id: sessionId });
      if ('reason' in result) return { ok: false, reason: result.reason };
      if (isRecord(result.data)
        && (result.data.status === 'membership_missing' || result.data.status === 'session_completed')) {
        return { ok: false, reason: result.data.status };
      }
      const snapshot = parseMembership(result.data);
      return snapshot ? { ok: true, snapshot } : { ok: false, reason: 'malformed' };
    },

    async leave(sessionId: string): Promise<LeaveRoomResult> {
      const result = await membershipRpc('leave_session', { p_session_id: sessionId });
      if ('reason' in result) return { ok: false, reason: result.reason };
      return isRecord(result.data) && result.data.status === 'ok'
        ? { ok: true }
        : { ok: false, reason: 'malformed' };
    },

    persist(
      snapshot: RoomMembershipSnapshot,
      options: { clearCreateRequestId?: boolean; rememberName?: boolean } = {},
    ): void {
      storage.writeSessionPointer(snapshot.pointer);
      if (options.clearCreateRequestId) storage.clearCreateRequestId();
      if (options.rememberName) storage.writeLastUsedName(snapshot.participant.name);
    },
  };
}

export type RoomMembershipService = ReturnType<typeof createRoomMembershipService>;
