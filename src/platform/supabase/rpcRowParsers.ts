import type {
  Participant,
  ParticipantRole,
  RoundParticipant,
  Session,
  Size,
  Value,
  Vote,
} from '../../lib/types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isRole(value: unknown): value is ParticipantRole {
  return value === 'facilitator' || value === 'participant';
}

function isSize(value: unknown): value is Size {
  return value === 'xs' || value === 's' || value === 'm' || value === 'l' || value === 'xl';
}

function isValue(value: unknown): value is Value {
  return value === 'gold' || value === 'silver' || value === 'bronze';
}

export function parseSession(value: unknown): Session | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' || typeof value.created_at !== 'string'
    || typeof value.current_round !== 'number' || !isNullableString(value.join_code)
    || typeof value.started !== 'boolean' || typeof value.status !== 'string'
    || typeof value.votes_revealed !== 'boolean' || typeof value.consensus_streak !== 'number'
  ) return null;
  return {
    id: value.id,
    created_at: value.created_at,
    current_round: value.current_round,
    join_code: value.join_code,
    started: value.started,
    status: value.status,
    votes_revealed: value.votes_revealed,
    consensus_streak: value.consensus_streak,
  };
}

export function parseParticipant(value: unknown): Participant | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' || typeof value.joined_at !== 'string'
    || typeof value.name !== 'string' || !isRole(value.role)
    || typeof value.session_id !== 'string' || !isNullableString(value.left_at)
  ) return null;
  return {
    id: value.id,
    joined_at: value.joined_at,
    name: value.name,
    role: value.role,
    session_id: value.session_id,
    left_at: value.left_at,
  };
}

export function parseVote(value: unknown): Vote | null {
  if (value === null || value === undefined || !isRecord(value)) return null;
  if (
    typeof value.id !== 'string' || typeof value.created_at !== 'string'
    || typeof value.participant_id !== 'string' || typeof value.round !== 'number'
    || typeof value.session_id !== 'string' || !isSize(value.size) || !isValue(value.value)
  ) return null;
  return {
    id: value.id,
    created_at: value.created_at,
    participant_id: value.participant_id,
    round: value.round,
    session_id: value.session_id,
    size: value.size,
    value: value.value,
  };
}

export function parseRoundParticipant(value: unknown): RoundParticipant | null {
  if (value === null || value === undefined || !isRecord(value)) return null;
  if (
    typeof value.joined_at !== 'string' || typeof value.participant_id !== 'string'
    || typeof value.reestimate_used !== 'boolean' || typeof value.round !== 'number'
    || typeof value.session_id !== 'string'
  ) return null;
  return {
    joined_at: value.joined_at,
    participant_id: value.participant_id,
    reestimate_used: value.reestimate_used,
    round: value.round,
    session_id: value.session_id,
  };
}
