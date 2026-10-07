import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flattenHealthCheckQuestions,
  SQUAD_HEALTH_TEMPLATE_V1,
} from '../../../../domains/health-check/domain';
import {
  createHealthCheckDraftState,
  healthCheckDraftReducer,
  type HealthCheckDraftState,
} from '../../../../domains/health-check/hooks/healthCheckDraftReducer';
import {
  HEALTH_CHECK_DRAFT_TTL_MS,
  cleanupHealthCheckDrafts,
  clearHealthCheckDraft,
  readHealthCheckDraft,
  writeHealthCheckDraft,
} from '../../../../domains/health-check/storage/healthCheckStorage';

const questions = flattenHealthCheckQuestions(SQUAD_HEALTH_TEMPLATE_V1);
const responses = (count: number) => Object.fromEntries(
  questions.slice(0, count).map((question, index) => [question.key, (index % 7) + 1]),
);
const savedAt = new Date('2026-09-03T12:00:00Z').getTime();
const storageKey = 'estimat_health_check_draft:migrating';

function storeRecord(draft: unknown, version = 1, metadata: Record<string, unknown> = {}) {
  localStorage.setItem(storageKey, JSON.stringify({
    schema: 'health-check-draft',
    version,
    savedAt: new Date(savedAt).toISOString(),
    expiresAt: new Date(savedAt + HEALTH_CHECK_DRAFT_TTL_MS).toISOString(),
    draft,
    ...metadata,
  }));
}

describe('healthCheckStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  const draft = {
    responses: { joy_look_forward: 5 as const },
    currentQuestionIndex: 1,
    view: 'question' as const,
  };

  it('stores a versioned local draft without adding identity fields', () => {
    const now = new Date('2026-09-03T12:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    writeHealthCheckDraft('room-1:participant-1', draft);

    expect(sessionStorage).toHaveLength(0);
    const serialized = localStorage.getItem(
      'estimat_health_check_draft:room-1:participant-1',
    );
    expect(serialized).not.toBeNull();
    expect(JSON.parse(serialized as string)).toEqual({
      schema: 'health-check-draft',
      version: 2,
      savedAt: '2026-09-03T12:00:00.000Z',
      expiresAt: new Date(now + HEALTH_CHECK_DRAFT_TTL_MS).toISOString(),
      draft,
    });
  });

  it('restores a draft after session storage is cleared to model tab or PWA reopen', () => {
    writeHealthCheckDraft('room-1:participant-1', draft);
    sessionStorage.clear();

    expect(readHealthCheckDraft('room-1:participant-1')).toEqual(draft);
  });

  it('self-deletes a draft when its short TTL has elapsed', () => {
    const savedAt = new Date('2026-09-03T12:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(savedAt);
    writeHealthCheckDraft('expired', draft);
    vi.mocked(Date.now).mockReturnValue(savedAt + HEALTH_CHECK_DRAFT_TTL_MS);

    expect(readHealthCheckDraft('expired')).toBeNull();
    expect(localStorage.getItem('estimat_health_check_draft:expired')).toBeNull();
  });

  it('begrenser utkastets levetid til serverrommets utløp og forlenger det ikke ved senere lagring', () => {
    const savedAt = new Date('2026-09-03T12:00:00Z').getTime();
    const roomExpiresAt = new Date(savedAt + 5 * 60_000).toISOString();
    vi.spyOn(Date, 'now').mockReturnValue(savedAt);
    writeHealthCheckDraft('bounded', draft, roomExpiresAt);

    vi.mocked(Date.now).mockReturnValue(savedAt + 60_000);
    writeHealthCheckDraft('bounded', draft, roomExpiresAt);
    expect(JSON.parse(localStorage.getItem('estimat_health_check_draft:bounded')!).expiresAt)
      .toBe(roomExpiresAt);

    vi.mocked(Date.now).mockReturnValue(savedAt + 5 * 60_000);
    expect(readHealthCheckDraft('bounded')).toBeNull();
  });

  it.each([
    ['malformed JSON', '{not-json'],
    ['unsupported schema version', JSON.stringify({
      schema: 'health-check-draft',
      version: 3,
      savedAt: '2026-09-03T12:00:00.000Z',
      expiresAt: '2026-09-04T11:55:00.000Z',
      draft,
    })],
    ['invalid draft data', JSON.stringify({
      schema: 'health-check-draft',
      version: 1,
      savedAt: '2026-09-03T12:00:00.000Z',
      expiresAt: '2026-09-04T11:55:00.000Z',
      draft: { ...draft, returnToReview: false, responses: { joy_look_forward: 8 } },
    })],
  ])('self-deletes %s', (_case, serialized) => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-03T13:00:00Z').getTime());
    const storageKey = 'estimat_health_check_draft:invalid';
    localStorage.setItem(storageKey, serialized);

    expect(readHealthCheckDraft('invalid')).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('cleanup scans the local draft store and removes expired records only', () => {
    const savedAt = new Date('2026-09-03T12:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(savedAt);
    writeHealthCheckDraft('expired', draft);
    vi.mocked(Date.now).mockReturnValue(savedAt + 60_000);
    writeHealthCheckDraft('current', draft);
    localStorage.setItem('unrelated', 'keep');
    vi.mocked(Date.now).mockReturnValue(savedAt + HEALTH_CHECK_DRAFT_TTL_MS);

    cleanupHealthCheckDrafts();

    expect(localStorage.getItem('estimat_health_check_draft:expired')).toBeNull();
    expect(readHealthCheckDraft('current')).toEqual(draft);
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });

  it('clear removes the local draft while leaving unrelated data untouched', () => {
    writeHealthCheckDraft('room-1:participant-1', draft);
    localStorage.setItem('unrelated', 'keep');

    clearHealthCheckDraft('room-1:participant-1');

    expect(readHealthCheckDraft('room-1:participant-1')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });

  it('fails safely when local storage access is denied', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });

    try {
      expect(readHealthCheckDraft('denied')).toBeNull();
      expect(() => writeHealthCheckDraft('denied', draft)).not.toThrow();
      expect(() => clearHealthCheckDraft('denied')).not.toThrow();
      expect(() => cleanupHealthCheckDrafts()).not.toThrow();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  });

  it('fails safely when the local storage quota is exhausted', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });

    expect(() => writeHealthCheckDraft('full', draft)).not.toThrow();
    expect(readHealthCheckDraft('full')).toBeNull();
  });

  it('beholder gjeldende verdi før Neste, men låser tidligere svar også etter flere reloads', () => {
    let state = createHealthCheckDraftState();
    for (const [index, question] of questions.entries()) {
      state = healthCheckDraftReducer(state, { type: 'answer', questionKey: question.key, score: 5 });
      writeHealthCheckDraft('reload', state);
      expect(readHealthCheckDraft('reload')).toEqual(state);
      state = readHealthCheckDraft('reload')!;
      state = healthCheckDraftReducer(state, { type: 'answer', questionKey: question.key, score: 6 });
      expect(state.responses[question.key]).toBe(6);

      state = healthCheckDraftReducer(state, { type: 'next', questionCount: questions.length });
      writeHealthCheckDraft('reload', state);
      expect(readHealthCheckDraft('reload')).toEqual(state);
      state = readHealthCheckDraft('reload')!;
      for (const previous of questions.slice(0, index + 1)) {
        expect(healthCheckDraftReducer(state, {
          type: 'answer', questionKey: previous.key, score: 1,
        })).toBe(state);
      }
    }
    expect(state.view).toBe('submit');
    expect(state.currentQuestionIndex).toBe(questions.length - 1);
    expect(healthCheckDraftReducer(state, { type: 'next', questionCount: questions.length })).toBe(state);
  });

  it.each([
    ['review', 'review', false, questions.length, questions.length - 1],
    ['redigering fra review', 'question', true, questions.length, 3],
    ['komplett før gammel Neste', 'question', false, questions.length, questions.length - 1],
    ['tilbakenavigert komplett utkast', 'question', false, questions.length, 0],
    ['delvis besvart', 'question', false, 5, 4],
    ['tilbakenavigert delvis utkast', 'question', false, 5, 1],
    ['delvis returnToReview', 'question', true, 5, 1],
    ['første ubesvarte', 'question', false, 5, 5],
    ['tomt', 'question', false, 0, 0],
  ] as const)('migrerer v1 %s uten å miste svar eller TTL', (_name, view, returnToReview, count, index) => {
    vi.spyOn(Date, 'now').mockReturnValue(savedAt + 60_000);
    const original = {
      responses: responses(count), currentQuestionIndex: index, view, returnToReview,
    };
    const expiry = new Date(savedAt + 5 * 60_000).toISOString();
    storeRecord(original, 1, { expiresAt: expiry });
    cleanupHealthCheckDrafts();
    expect(localStorage.getItem(storageKey)).not.toBeNull();

    const migrated = readHealthCheckDraft('migrating')!;
    expect(migrated).toEqual({
      responses: original.responses,
      currentQuestionIndex: Math.min(count, questions.length - 1),
      view: count === questions.length ? 'submit' : 'question',
    });
    expect(readHealthCheckDraft('migrating')).toEqual(migrated);
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({
      savedAt: new Date(savedAt).toISOString(), expiresAt: expiry,
    });
    for (const question of questions.slice(0, count)) {
      expect(healthCheckDraftReducer(migrated, {
        type: 'answer', questionKey: question.key, score: 7,
      })).toBe(migrated);
    }
    // The hook persists the restored state on mount; this must not renew the old TTL.
    writeHealthCheckDraft('migrating', migrated);
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({ version: 2, expiresAt: expiry });
    expect(readHealthCheckDraft('migrating')).toEqual(migrated);
    vi.mocked(Date.now).mockReturnValue(Date.parse(expiry));
    expect(readHealthCheckDraft('migrating')).toBeNull();
  });

  it.each([1, 2])('forkaster malformed v%s states og metadata', (version) => {
    vi.spyOn(Date, 'now').mockReturnValue(savedAt + 60_000);
    const valid = { ...draft, ...(version === 1 ? { returnToReview: false } : {}) };
    const invalidDrafts: unknown[] = [
      null, [], {},
      { ...valid, identity: 'unexpected' },
      { ...valid, responses: [] },
      { ...valid, responses: { unknown: 5 } },
      ...[null, '5', 0, 8, 1.5].map((score) => ({ ...valid, responses: { joy_look_forward: score } })),
      { ...valid, responses: { [questions[1].key]: 5 } },
      { ...valid, responses: { ...responses(1), [questions[3].key]: 5 } },
      ...[-1, 1.5, questions.length, '1', null].map((currentQuestionIndex) => ({ ...valid, currentQuestionIndex })),
      { ...valid, currentQuestionIndex: 2 },
      { ...valid, view: version === 1 ? 'submit' : 'review' },
      { ...valid, view: version === 1 ? 'review' : 'submit' },
      ...(version === 1 ? [
        { ...valid, returnToReview: 'true' },
        draft,
      ] : [
        { ...valid, returnToReview: false },
        { ...valid, responses: responses(4), currentQuestionIndex: 1 },
        { ...valid, responses: responses(questions.length), currentQuestionIndex: 0, view: 'submit' },
      ]),
    ];
    for (const invalid of invalidDrafts) {
      storeRecord(invalid, version);
      expect(readHealthCheckDraft('migrating'), JSON.stringify(invalid)).toBeNull();
      expect(localStorage.getItem(storageKey)).toBeNull();
    }
    for (const metadata of [
      { schema: 'other' }, { identity: 'extra' }, { savedAt: 'invalid' }, { expiresAt: 'invalid' },
      { savedAt: new Date(savedAt + 120_000).toISOString() },
      { expiresAt: new Date(savedAt).toISOString() },
      { expiresAt: new Date(savedAt + HEALTH_CHECK_DRAFT_TTL_MS + 1).toISOString() },
    ]) {
      storeRecord(valid, version, metadata);
      expect(readHealthCheckDraft('migrating')).toBeNull();
      expect(localStorage.getItem(storageKey)).toBeNull();
    }
  });

  it('lagrer ikke ugyldige v2 states', () => {
    const invalid = { ...draft, currentQuestionIndex: 2 };
    writeHealthCheckDraft('invalid-write', invalid as HealthCheckDraftState);
    expect(localStorage.getItem('estimat_health_check_draft:invalid-write')).toBeNull();
  });

  it('sletter utløpte v1-utkast før migrering', () => {
    vi.spyOn(Date, 'now').mockReturnValue(savedAt + HEALTH_CHECK_DRAFT_TTL_MS);
    storeRecord({ ...draft, returnToReview: false });
    expect(readHealthCheckDraft('migrating')).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });
});
