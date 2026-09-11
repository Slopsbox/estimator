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
import { isExpiredJwtError, type RpcClient } from '../../platform/supabase/rpcClient';
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
export type CreateHealthRoomResult = { ok: true; snapshot: RoomMembershipSnapshot }
  | { ok: false; reason: ServiceFailure | 'active_session_exists' | 'request_already_used' };
export type JoinRoomResult = { ok: true; snapshot: RoomMembershipSnapshot }
  | { ok: false; reason: ServiceFailure | 'session_not_found' | 'role_conflict' };
export type RestoreRoomResult = { ok: true; snapshot: RoomMembershipSnapshot }
  | { ok: false; reason: ServiceFailure | 'membership_missing' | 'session_completed' };
export type LeaveRoomResult = { ok: true } | { ok: false; reason: ServiceFailure };

export interface CreateHealthRoomInput {
  name: string;
  squadName: string;
  measurementDate: string;
  requestId: string;
  deliveryId: string;
}

function isActivityType(value: unknown): value is RoomActivityType {
  return value === 'estimation' || value === 'health_check';
}

const voteFields = ['id', 'session_id', 'participant_id', 'round', 'size', 'value', 'created_at'] as const;
const roundParticipantFields = ['session_id', 'round', 'participant_id', 'joined_at', 'reestimate_used'] as const;

function normalizeNullableComposite(
  value: unknown,
  expectedFields: readonly string[],
): unknown {
  if (value === null || value === undefined || !isRecord(value)) return value;
  const keys = Object.keys(value);
  return keys.length === expectedFields.length
    && expectedFields.every((field) => Object.prototype.hasOwnProperty.call(value, field))
    && expectedFields.every((field) => value[field] === null)
    ? null
    : value;
}

function parseMembership(value: unknown): RoomMembershipSnapshot | null {
  if (!isRecord(value) || (value.status !== 'ok' && value.status !== 'active_session_exists')) return null;
  if (!isRecord(value.session)) return null;
  const sessionRecord = value.session;
  const session = parseSession(sessionRecord);
  const participant = parseParticipant(value.participant);
  const rawRoundParticipant = normalizeNullableComposite(value.round_participant, roundParticipantFields);
  const rawVote = normalizeNullableComposite(value.vote, voteFields);
  const hasEnvelopeActivityType = hasOwn(value, 'activity_type');
  if (
    (hasEnvelopeActivityType && !isActivityType(value.activity_type))
    || (hasEnvelopeActivityType && value.activity_type !== session?.activity_type)
  ) return null;

  if (!session || !participant || participant.session_id !== session.id) return null;
  const activityType = session.activity_type;
  if (activityType !== 'estimation' && (
    (hasOwn(value, 'round_participant') && rawRoundParticipant != null)
    || (hasOwn(value, 'vote') && rawVote != null)
  )) return null;
  if (activityType === 'estimation' && (
    (hasOwn(value, 'round_participant') && rawRoundParticipant != null && !parseRoundParticipant(rawRoundParticipant))
    || (hasOwn(value, 'vote') && rawVote != null && !parseVote(rawVote))
  )) return null;
  const roundParticipant = parseRoundParticipant(rawRoundParticipant);
  if (roundParticipant && (
      roundParticipant.session_id !== session.id
      || roundParticipant.participant_id !== participant.id
      || roundParticipant.round !== session.current_round
  )) return null;
  const ownVote = parseVote(rawVote);
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

function parseHealthMembership(value: unknown): RoomMembershipSnapshot | null {
  if (!isRecord(value) || value.status !== 'ok' || !isRecord(value.session)) return null;
  const healthSession = value.session;
  const participant = parseParticipant(value.participant);
  if (
    healthSession.activity_type !== 'health_check'
    || typeof healthSession.id !== 'string'
    || typeof healthSession.status !== 'string'
    || typeof healthSession.join_code !== 'string'
    || typeof healthSession.created_at !== 'string'
    || !['lobby', 'collecting', 'download_pending'].includes(String(healthSession.phase))
    || healthSession.template_version !== 'squad-health-v1'
    || typeof healthSession.squad_name !== 'string'
    || typeof healthSession.measurement_date !== 'string'
    || typeof healthSession.expires_at !== 'string'
    || !participant
    || participant.session_id !== healthSession.id
    || participant.role !== 'facilitator'
  ) return null;

  const session: Session = {
    id: healthSession.id,
    activity_type: 'health_check',
    status: healthSession.status,
    join_code: healthSession.join_code,
    created_at: healthSession.created_at,
    current_round: 1,
    votes_revealed: false,
    started: false,
    consensus_streak: 0,
  };
  const localParticipant: LocalParticipant = {
    participantId: participant.id,
    sessionId: participant.session_id,
    name: participant.name,
    role: participant.role,
  };
  return {
    session,
    participant,
    localParticipant,
    pointer: { version: 2, activityType: 'health_check', ...localParticipant },
    activityType: 'health_check',
    ownVote: null,
    roundParticipant: null,
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
      return result.error
        ? { reason: isExpiredJwtError(result.error) ? 'identity' : 'rpc' }
        : { data: result.data };
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

    async createHealth(input: CreateHealthRoomInput): Promise<CreateHealthRoomResult> {
      const result = await membershipRpc('create_health_check_room_prototype', {
        p_request_id: input.requestId,
        p_facilitator_name: input.name.trim(),
        p_squad_name: input.squadName.trim(),
        p_measurement_date: input.measurementDate,
        p_delivery_id: input.deliveryId,
      });
      if ('reason' in result) return { ok: false, reason: result.reason };
      if (isRecord(result.data)
        && result.data.status === 'active_session_exists') {
        const restored = await membershipRpc('restore_active_health_check_for_facilitator', {});
        if ('reason' in restored) return { ok: false, reason: restored.reason };
        const snapshot = parseHealthMembership(restored.data);
        return snapshot ? { ok: true, snapshot } : { ok: false, reason: 'malformed' };
      }
      if (isRecord(result.data) && result.data.status === 'request_already_used') {
        return { ok: false, reason: result.data.status };
      }
      const snapshot = parseHealthMembership(result.data);
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
