import { SQUAD_HEALTH_TEMPLATE_V1, type QuestionKey } from '../domain';
import type { HealthCheckDraftState } from '../hooks/healthCheckDraftReducer';

const DRAFT_PREFIX = 'estimat_health_check_draft:';
const RESULT_ROOM_KEY = 'estimat_health_check_result_room';
const RESULT_ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const DRAFT_SCHEMA = 'health-check-draft';
const DRAFT_VERSION = 1;
export const HEALTH_CHECK_DRAFT_TTL_MS = 23 * 60 * 60 * 1000 + 55 * 60 * 1000;
const questionKeys = new Set(SQUAD_HEALTH_TEMPLATE_V1.areas.flatMap((area) =>
  area.questions.map((question) => question.key)));

export function readHealthCheckDraft(key: string): HealthCheckDraftState | null {
  cleanupHealthCheckDrafts();
  const storageKey = `${DRAFT_PREFIX}${key}`;
  const value = readLocalJson(storageKey);
  if (!isHealthCheckDraftRecord(value, Date.now())) {
    remove(storageKey);
    return null;
  }
  return value.draft;
}

export function writeHealthCheckDraft(key: string, state: HealthCheckDraftState, roomExpiresAt?: string): void {
  cleanupHealthCheckDrafts();
  const savedAt = Date.now();
  const existing = readLocalJson(`${DRAFT_PREFIX}${key}`);
  const existingExpiry = isRecord(existing) && typeof existing.expiresAt === 'string'
    ? Date.parse(existing.expiresAt)
    : Number.POSITIVE_INFINITY;
  const roomExpiry = roomExpiresAt ? Date.parse(roomExpiresAt) : Number.POSITIVE_INFINITY;
  const expiresAt = Math.min(savedAt + HEALTH_CHECK_DRAFT_TTL_MS, existingExpiry, roomExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= savedAt) {
    remove(`${DRAFT_PREFIX}${key}`);
    return;
  }
  writeLocalJson(`${DRAFT_PREFIX}${key}`, {
    schema: DRAFT_SCHEMA,
    version: DRAFT_VERSION,
    savedAt: new Date(savedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    draft: state,
  });
}

export function clearHealthCheckDraft(key: string): void {
  remove(`${DRAFT_PREFIX}${key}`);
}

export function readHealthCheckResultRoom(): string | null {
  const value = readLocalJson(RESULT_ROOM_KEY);
  return isRecord(value) && typeof value.roomId === 'string'
    && isFresh(value.updatedAt, RESULT_ROOM_TTL_MS)
    ? value.roomId
    : null;
}

export function writeHealthCheckResultRoom(roomId: string): void {
  writeLocalJson(RESULT_ROOM_KEY, { roomId, updatedAt: new Date().toISOString() });
}

export function clearHealthCheckResultRoom(): void {
  remove(RESULT_ROOM_KEY);
}

function readLocalJson(key: string): unknown {
  try {
    const serialized = localStorage.getItem(key);
    return serialized ? JSON.parse(serialized) : null;
  } catch {
    return null;
  }
}

function writeLocalJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is best-effort when browser storage is unavailable.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Persistence is best-effort when browser storage is unavailable.
  }
}

export function cleanupHealthCheckDrafts(): void {
  try {
    const now = Date.now();
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(DRAFT_PREFIX)) continue;
      const value = readLocalJson(key);
      if (!isHealthCheckDraftRecord(value, now)) localStorage.removeItem(key);
    }
  } catch {
    // Cleanup is best-effort when browser storage is unavailable.
  }
}

function isHealthCheckDraftRecord(
  value: unknown,
  now: number,
): value is { readonly draft: HealthCheckDraftState } {
  if (!hasExactKeys(value, ['schema', 'version', 'savedAt', 'expiresAt', 'draft'])
    || value.schema !== DRAFT_SCHEMA
    || value.version !== DRAFT_VERSION
    || typeof value.savedAt !== 'string'
    || typeof value.expiresAt !== 'string'
    || !isHealthCheckDraftState(value.draft)) return false;

  const savedAt = Date.parse(value.savedAt);
  const expiresAt = Date.parse(value.expiresAt);
  return Number.isFinite(savedAt)
    && Number.isFinite(expiresAt)
    && savedAt <= now
    && expiresAt > savedAt
    && expiresAt <= savedAt + HEALTH_CHECK_DRAFT_TTL_MS
    && now < expiresAt;
}

function isHealthCheckDraftState(value: unknown): value is HealthCheckDraftState {
  if (!hasExactKeys(value, ['responses', 'currentQuestionIndex', 'view', 'returnToReview'])
    || !isRecord(value.responses)
    || !Number.isInteger(value.currentQuestionIndex)
    || (value.currentQuestionIndex as number) < 0
    || (value.currentQuestionIndex as number) >= questionKeys.size
    || (value.view !== 'question' && value.view !== 'review')
    || typeof value.returnToReview !== 'boolean') return false;

  return Object.entries(value.responses).every(([questionKey, score]) =>
    questionKeys.has(questionKey as QuestionKey)
    && Number.isInteger(score)
    && (score as number) >= 1
    && (score as number) <= 7);
}

function hasExactKeys<const Key extends string>(
  value: unknown,
  keys: readonly Key[],
): value is Record<Key, unknown> {
  if (!isRecord(value)) return false;
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => key in value);
}

function isFresh(value: unknown, ttlMs: number): boolean {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= ttlMs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
