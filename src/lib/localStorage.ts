import type { LocalParticipant, ParticipantRole } from './types';

export const LOCAL_PARTICIPANT_STORAGE_KEY = 'estimat_local_participant';
export const LAST_USED_NAME_STORAGE_KEY = 'estimat_last_used_name';

function isParticipantRole(value: unknown): value is ParticipantRole {
  return value === 'facilitator' || value === 'participant';
}

function isLocalParticipant(value: unknown): value is LocalParticipant {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return typeof candidate.participantId === 'string'
    && candidate.participantId.trim().length > 0
    && typeof candidate.sessionId === 'string'
    && candidate.sessionId.trim().length > 0
    && typeof candidate.name === 'string'
    && isParticipantRole(candidate.role);
}

export function readLocalParticipant(): LocalParticipant | null {
  const serialized = localStorage.getItem(LOCAL_PARTICIPANT_STORAGE_KEY);
  if (!serialized) return null;

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (isLocalParticipant(parsed)) return parsed;
  } catch {
    // Ugyldig JSON behandles på samme måte som en ugyldig objektform.
  }

  localStorage.removeItem(LOCAL_PARTICIPANT_STORAGE_KEY);
  return null;
}

export function writeLocalParticipant(participant: LocalParticipant): void {
  localStorage.setItem(LOCAL_PARTICIPANT_STORAGE_KEY, JSON.stringify(participant));
}

export function clearLocalParticipant(): void {
  localStorage.removeItem(LOCAL_PARTICIPANT_STORAGE_KEY);
}

export function readLastUsedName(): string {
  return localStorage.getItem(LAST_USED_NAME_STORAGE_KEY) ?? '';
}

export function writeLastUsedName(name: string): void {
  localStorage.setItem(LAST_USED_NAME_STORAGE_KEY, name);
}
