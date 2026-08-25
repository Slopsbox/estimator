import type { LocalParticipant, ParticipantRole, RoomActivityType, SessionPointer } from './types';

export const LOCAL_PARTICIPANT_STORAGE_KEY = 'estimat_local_participant';
export const LAST_USED_NAME_STORAGE_KEY = 'estimat_last_used_name';
export const CREATE_REQUEST_ID_STORAGE_KEY = 'estimat_create_request_id';
const POINTER_TTL_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isParticipantRole(value: unknown): value is ParticipantRole {
  return value === 'facilitator' || value === 'participant';
}

function isRoomActivityType(value: unknown): value is RoomActivityType {
  return value === 'estimation' || value === 'health_check';
}

interface StoredPointerCandidate extends LocalParticipant {
  version?: unknown;
  activityType?: unknown;
  updatedAt?: unknown;
}

function isPointerShape(value: unknown): value is StoredPointerCandidate {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return typeof candidate.participantId === 'string'
    && candidate.participantId.trim().length > 0
    && typeof candidate.sessionId === 'string'
    && candidate.sessionId.trim().length > 0
    && typeof candidate.name === 'string'
    && isParticipantRole(candidate.role);
}

export function readSessionPointer(): SessionPointer | null {
  const serialized = localStorage.getItem(LOCAL_PARTICIPANT_STORAGE_KEY);
  if (!serialized) return null;

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (isPointerShape(parsed) && (parsed.version === undefined || parsed.version === 1 || parsed.version === 2)) {
      const activityType = parsed.version === 2
        ? (isRoomActivityType(parsed.activityType)
          ? parsed.activityType
          : null)
        : 'estimation';
      if (!activityType) throw new Error('invalid_activity_type');
      const updatedAt = typeof parsed.updatedAt === 'string'
        ? parsed.updatedAt
        : new Date().toISOString();
      const updatedAtMs = Date.parse(updatedAt);
      if (!Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs > POINTER_TTL_MS) {
        localStorage.removeItem(LOCAL_PARTICIPANT_STORAGE_KEY);
        return null;
      }
      const pointer: SessionPointer = {
        version: 2,
        activityType,
        updatedAt,
        participantId: parsed.participantId,
        sessionId: parsed.sessionId,
        name: parsed.name,
        role: parsed.role,
      };
      if (parsed.version !== 2 || typeof parsed.updatedAt !== 'string') {
        writeSessionPointer(pointer);
      }
      return pointer;
    }
  } catch {
    // Ugyldig JSON behandles på samme måte som en ugyldig objektform.
  }

  localStorage.removeItem(LOCAL_PARTICIPANT_STORAGE_KEY);
  return null;
}

export function writeSessionPointer(pointer: SessionPointer): void {
  localStorage.setItem(LOCAL_PARTICIPANT_STORAGE_KEY, JSON.stringify({
    ...pointer,
    updatedAt: new Date().toISOString(),
  }));
}

export function clearSessionPointer(): void {
  localStorage.removeItem(LOCAL_PARTICIPANT_STORAGE_KEY);
}

/** Midlertidige alias beholdes mens resten av frontend flyttes til pointer-navn. */
export function readLocalParticipant(): LocalParticipant | null {
  const pointer = readSessionPointer();
  if (!pointer) return null;
  return {
    participantId: pointer.participantId,
    sessionId: pointer.sessionId,
    name: pointer.name,
    role: pointer.role,
  };
}

export function writeLocalParticipant(participant: LocalParticipant): void {
  writeSessionPointer({ version: 2, activityType: 'estimation', ...participant });
}

export const clearLocalParticipant = clearSessionPointer;

export function getOrCreateCreateRequestId(): string {
  const existing = localStorage.getItem(CREATE_REQUEST_ID_STORAGE_KEY);
  if (existing && UUID_PATTERN.test(existing)) return existing;
  const requestId = crypto.randomUUID();
  localStorage.setItem(CREATE_REQUEST_ID_STORAGE_KEY, requestId);
  return requestId;
}

export function clearCreateRequestId(): void {
  localStorage.removeItem(CREATE_REQUEST_ID_STORAGE_KEY);
}

export function readLastUsedName(): string {
  return localStorage.getItem(LAST_USED_NAME_STORAGE_KEY) ?? '';
}

export function writeLastUsedName(name: string): void {
  localStorage.setItem(LAST_USED_NAME_STORAGE_KEY, name);
}
