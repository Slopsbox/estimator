import { SQUAD_HEALTH_TEMPLATE_V1, type QuestionKey, type SevenPointScore } from '../domain';
import type { HealthCheckDraftState } from '../hooks/healthCheckDraftReducer';

const DRAFT_PREFIX = 'estimat_health_check_draft:';
const RESULT_ROOM_KEY = 'estimat_health_check_result_room';
const TTL_MS = 24 * 60 * 60 * 1000;
const questionKeys = new Set(SQUAD_HEALTH_TEMPLATE_V1.areas.flatMap((area) =>
  area.questions.map((question) => question.key)));

export function readHealthCheckDraft(key: string): HealthCheckDraftState | null {
  removeExpiredHealthCheckDrafts();
  const storageKey = `${DRAFT_PREFIX}${key}`;
  const value = readJson(storageKey);
  if (!isRecord(value) || !isFresh(value.updatedAt) || !isRecord(value.responses)) {
    remove(storageKey);
    return null;
  }
  if (!Number.isInteger(value.currentQuestionIndex)
    || (value.currentQuestionIndex as number) < 0
    || (value.currentQuestionIndex as number) >= questionKeys.size
    || (value.view !== 'question' && value.view !== 'review')
    || typeof value.returnToReview !== 'boolean') return null;

  const responses: Partial<Record<QuestionKey, SevenPointScore>> = {};
  for (const [questionKey, score] of Object.entries(value.responses)) {
    if (!questionKeys.has(questionKey as QuestionKey)
      || !Number.isInteger(score)
      || (score as number) < 1
      || (score as number) > 7) return null;
    responses[questionKey as QuestionKey] = score as SevenPointScore;
  }
  return {
    responses,
    currentQuestionIndex: value.currentQuestionIndex as number,
    view: value.view,
    returnToReview: value.returnToReview,
  };
}

export function writeHealthCheckDraft(key: string, state: HealthCheckDraftState): void {
  removeExpiredHealthCheckDrafts();
  writeJson(`${DRAFT_PREFIX}${key}`, { ...state, updatedAt: new Date().toISOString() });
}

export function clearHealthCheckDraft(key: string): void {
  remove(`${DRAFT_PREFIX}${key}`);
}

export function readHealthCheckResultRoom(): string | null {
  const value = readJson(RESULT_ROOM_KEY);
  return isRecord(value) && typeof value.roomId === 'string' && isFresh(value.updatedAt)
    ? value.roomId
    : null;
}

export function writeHealthCheckResultRoom(roomId: string): void {
  writeJson(RESULT_ROOM_KEY, { roomId, updatedAt: new Date().toISOString() });
}

export function clearHealthCheckResultRoom(): void {
  remove(RESULT_ROOM_KEY);
}

function readJson(key: string): unknown {
  try {
    const storage = key.startsWith(DRAFT_PREFIX) ? sessionStorage : localStorage;
    const serialized = storage.getItem(key);
    return serialized ? JSON.parse(serialized) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    const storage = key.startsWith(DRAFT_PREFIX) ? sessionStorage : localStorage;
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is best-effort when browser storage is unavailable.
  }
}

function remove(key: string): void {
  try {
    const storage = key.startsWith(DRAFT_PREFIX) ? sessionStorage : localStorage;
    storage.removeItem(key);
  } catch {
    // Persistence is best-effort when browser storage is unavailable.
  }
}

function removeExpiredHealthCheckDrafts(): void {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith(DRAFT_PREFIX)) continue;
      const value = readJson(key);
      if (!isRecord(value) || !isFresh(value.updatedAt)) sessionStorage.removeItem(key);
    }
  } catch {
    // Cleanup is best-effort when browser storage is unavailable.
  }
}

function isFresh(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= TTL_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
