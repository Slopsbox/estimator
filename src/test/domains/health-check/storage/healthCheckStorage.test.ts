import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEALTH_CHECK_DRAFT_TTL_MS,
  cleanupHealthCheckDrafts,
  clearHealthCheckDraft,
  readHealthCheckDraft,
  writeHealthCheckDraft,
} from '../../../../domains/health-check/storage/healthCheckStorage';

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
    returnToReview: false,
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
      version: 1,
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
    writeHealthCheckDraft('bounded', { ...draft, currentQuestionIndex: 2 }, roomExpiresAt);
    expect(JSON.parse(localStorage.getItem('estimat_health_check_draft:bounded')!).expiresAt)
      .toBe(roomExpiresAt);

    vi.mocked(Date.now).mockReturnValue(savedAt + 5 * 60_000);
    expect(readHealthCheckDraft('bounded')).toBeNull();
  });

  it.each([
    ['malformed JSON', '{not-json'],
    ['unsupported schema version', JSON.stringify({
      schema: 'health-check-draft',
      version: 2,
      savedAt: '2026-09-03T12:00:00.000Z',
      expiresAt: '2026-09-04T11:55:00.000Z',
      draft,
    })],
    ['invalid draft data', JSON.stringify({
      schema: 'health-check-draft',
      version: 1,
      savedAt: '2026-09-03T12:00:00.000Z',
      expiresAt: '2026-09-04T11:55:00.000Z',
      draft: { ...draft, responses: { joy_look_forward: 8 } },
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
});
