import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CREATE_REQUEST_ID_STORAGE_KEY,
  LOCAL_PARTICIPANT_STORAGE_KEY,
  clearCreateRequestId,
  getOrCreateCreateRequestId,
  readLocalParticipant,
  readSessionPointer,
  writeLocalParticipant,
  writeSessionPointer,
} from '../../lib/localStorage';

describe('session storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('migrerer legacy participant-format til v2 estimation-pointer', () => {
    localStorage.setItem(LOCAL_PARTICIPANT_STORAGE_KEY, JSON.stringify({
      participantId: 'participant-1',
      sessionId: 'session-1',
      name: 'Kari',
      role: 'participant',
    }));

    expect(readSessionPointer()).toEqual({
      version: 2,
      activityType: 'estimation',
      updatedAt: expect.any(String),
      participantId: 'participant-1',
      sessionId: 'session-1',
      name: 'Kari',
      role: 'participant',
    });
    expect(JSON.parse(localStorage.getItem(LOCAL_PARTICIPANT_STORAGE_KEY)!)).toMatchObject({
      version: 2,
      activityType: 'estimation',
    });
  });

  it('migrerer v1 til v2 estimation-pointer', () => {
    localStorage.setItem(LOCAL_PARTICIPANT_STORAGE_KEY, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      participantId: 'participant-1',
      sessionId: 'session-1',
      name: 'Kari',
      role: 'participant',
    }));

    expect(readSessionPointer()).toMatchObject({ version: 2, activityType: 'estimation' });
    expect(JSON.parse(localStorage.getItem(LOCAL_PARTICIPANT_STORAGE_KEY)!)).toMatchObject({
      version: 2,
      activityType: 'estimation',
    });
  });

  it('sletter korrupt pointer', () => {
    localStorage.setItem(LOCAL_PARTICIPANT_STORAGE_KEY, JSON.stringify({
      version: 2,
      activityType: 'estimation',
      participantId: '',
      sessionId: 'session-1',
      name: 'Kari',
      role: 'participant',
    }));

    expect(readSessionPointer()).toBeNull();
    expect(localStorage.getItem(LOCAL_PARTICIPANT_STORAGE_KEY)).toBeNull();
  });

  it('leser pointer skrevet i gjeldende format', () => {
    writeSessionPointer({
      version: 2,
      activityType: 'health_check',
      participantId: 'participant-1',
      sessionId: 'session-1',
      name: 'Kari',
      role: 'participant',
    });

    expect(readSessionPointer()).toMatchObject({
      sessionId: 'session-1',
      activityType: 'health_check',
    });
  });

  it.each(['unknown', null, undefined])('sletter v2 med ugyldig activityType: %s', (activityType) => {
    localStorage.setItem(LOCAL_PARTICIPANT_STORAGE_KEY, JSON.stringify({
      version: 2,
      activityType,
      updatedAt: new Date().toISOString(),
      participantId: 'participant-1',
      sessionId: 'session-1',
      name: 'Kari',
      role: 'participant',
    }));

    expect(readSessionPointer()).toBeNull();
    expect(localStorage.getItem(LOCAL_PARTICIPANT_STORAGE_KEY)).toBeNull();
  });

  it('sletter pointer som er eldre enn 24 timer', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-08-25T12:00:00Z').getTime());
    localStorage.setItem(LOCAL_PARTICIPANT_STORAGE_KEY, JSON.stringify({
      version: 2,
      activityType: 'estimation',
      participantId: 'participant-1',
      sessionId: 'session-1',
      name: 'Kari',
      role: 'participant',
      updatedAt: '2026-08-24T11:59:59Z',
    }));

    expect(readSessionPointer()).toBeNull();
    expect(localStorage.getItem(LOCAL_PARTICIPANT_STORAGE_KEY)).toBeNull();
  });

  it('writeLocalParticipant skriver v2 estimation uten at LocalParticipant arver metadata', () => {
    writeLocalParticipant({
      participantId: 'participant-1',
      sessionId: 'session-1',
      name: 'Kari',
      role: 'participant',
    });

    expect(JSON.parse(localStorage.getItem(LOCAL_PARTICIPANT_STORAGE_KEY)!)).toMatchObject({
      version: 2,
      activityType: 'estimation',
    });
    expect(readLocalParticipant()).toEqual({
      participantId: 'participant-1',
      sessionId: 'session-1',
      name: 'Kari',
      role: 'participant',
    });
  });

  it('beholder samme create request-ID frem til den ryddes', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');

    expect(getOrCreateCreateRequestId()).toBe('11111111-1111-4111-8111-111111111111');
    expect(getOrCreateCreateRequestId()).toBe('11111111-1111-4111-8111-111111111111');
    expect(localStorage.getItem(CREATE_REQUEST_ID_STORAGE_KEY)).toBe('11111111-1111-4111-8111-111111111111');

    clearCreateRequestId();

    expect(getOrCreateCreateRequestId()).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('erstatter ugyldig create request-ID med en UUID', () => {
    localStorage.setItem(CREATE_REQUEST_ID_STORAGE_KEY, 'not-a-uuid');
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');

    expect(getOrCreateCreateRequestId()).toBe('11111111-1111-4111-8111-111111111111');
    expect(localStorage.getItem(CREATE_REQUEST_ID_STORAGE_KEY)).toBe('11111111-1111-4111-8111-111111111111');
  });
});
