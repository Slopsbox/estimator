import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ============================================================
// vi.hoisted() sikrer at disse variablene er tilgjengelige
// når vi.mock() hoistet factory kjører
// ============================================================

const { chainable, channelMock } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelMock: Record<string, any> = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chainable: Record<string, any> = {
    from: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    order: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn(),
    channel: vi.fn().mockReturnValue(channelMock),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  };

  const syncMethods = ['from', 'select', 'insert', 'update', 'eq', 'ilike', 'order'];
  syncMethods.forEach((m) => chainable[m].mockReturnValue(chainable));

  return { chainable, channelMock };
});

// ============================================================
// Mocks – hoistet til topp av vitest
// ============================================================

vi.mock('../../lib/supabase', () => ({ supabase: chainable }));
vi.mock('../../lib/joinCode', () => ({ generateJoinCode: vi.fn() }));

// ============================================================
// Importer hooks og mocked hjelpere ETTER vi.mock()
// ============================================================

import { useSession } from '../../hooks/useSession';
import { generateJoinCode } from '../../lib/joinCode';

const mockGenerateJoinCode = vi.mocked(generateJoinCode);

// ============================================================
// Reset-hjelpere
// ============================================================

function resetChainable() {
  vi.clearAllMocks();

  const syncMethods = ['from', 'select', 'insert', 'update', 'eq', 'ilike', 'order'];
  syncMethods.forEach((m) => chainable[m].mockReturnValue(chainable));

  chainable.single.mockResolvedValue({ data: null, error: null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chainable.then.mockImplementation((cb: (r: any) => void) => {
    cb({ data: null, error: null });
    return Promise.resolve();
  });

  channelMock.on.mockReturnThis();
  channelMock.subscribe.mockReturnThis();
  chainable.channel.mockReturnValue(channelMock);
  chainable.removeChannel.mockResolvedValue(undefined);
}

// ============================================================
// Faste testdata
// ============================================================

const MOCK_SESSION = {
  id: 'session-123',
  status: 'active' as const,
  current_round: 1,
  created_at: '2026-01-01T00:00:00Z',
  join_code: 'ABCD',
  votes_revealed: false,
  started: false,
};

const MOCK_PARTICIPANT = {
  id: 'participant-456',
  session_id: 'session-123',
  name: 'Ola Nordmann',
  role: 'facilitator' as const,
  joined_at: '2026-01-01T00:00:00Z',
};

// Hjelpefunksjon: sett opp en ferdig opprettet sesjon
async function setupCreatedSession(
  result: ReturnType<typeof renderHook<ReturnType<typeof useSession>, void>>['result'],
) {
  mockGenerateJoinCode.mockReturnValue('ABCD');
  chainable.single
    .mockResolvedValueOnce({ data: MOCK_SESSION, error: null })
    .mockResolvedValueOnce({ data: MOCK_PARTICIPANT, error: null });

  await act(async () => {
    await result.current.createSession('Ola Nordmann');
  });
}

// ============================================================
// Tester
// ============================================================

describe('useSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetChainable();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------
  // createSession
  // -------------------------------------------------------

  describe('createSession', () => {
    it('happy path: oppretter sesjon med riktige felter og registrerer fasilitator', async () => {
      mockGenerateJoinCode.mockReturnValue('ABCD');

      chainable.single
        .mockResolvedValueOnce({ data: MOCK_SESSION, error: null })
        .mockResolvedValueOnce({ data: MOCK_PARTICIPANT, error: null });

      const { result } = renderHook(() => useSession());

      let returnedSession = null;
      await act(async () => {
        returnedSession = await result.current.createSession('Ola Nordmann');
      });

      // Verifiser at sessions-insert ble kalt med riktige felter
      expect(chainable.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          current_round: 1,
          join_code: 'ABCD',
          votes_revealed: false,
          started: false,
        }),
      );

      // Verifiser at fasilitator ble registrert
      expect(chainable.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: MOCK_SESSION.id,
          name: 'Ola Nordmann',
          role: 'facilitator',
        }),
      );

      // Returnert sesjon
      expect(returnedSession).toEqual(MOCK_SESSION);

      // State er oppdatert
      expect(result.current.session).toEqual(MOCK_SESSION);
      expect(result.current.localParticipant?.participantId).toBe(MOCK_PARTICIPANT.id);

      // sessionStorage er skrevet
      const stored = sessionStorage.getItem('estimering_participant');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.sessionId).toBe(MOCK_SESSION.id);
      expect(parsed.role).toBe('facilitator');
    });

    it('join_code kollisjon: retry ved 23505, lykkes på andre forsøk', async () => {
      mockGenerateJoinCode
        .mockReturnValueOnce('XXXX') // første kode → kollisjon
        .mockReturnValueOnce('YYYY'); // andre kode → suksess

      const collisionError = { code: '23505', message: 'unique constraint violation' };
      const successSession = { ...MOCK_SESSION, join_code: 'YYYY', id: 'session-789' };
      const successParticipant = { ...MOCK_PARTICIPANT, session_id: 'session-789' };

      chainable.single
        .mockResolvedValueOnce({ data: null, error: collisionError })
        .mockResolvedValueOnce({ data: successSession, error: null })
        .mockResolvedValueOnce({ data: successParticipant, error: null });

      const { result } = renderHook(() => useSession());

      let returnedSession = null;
      await act(async () => {
        returnedSession = await result.current.createSession('Ola Nordmann');
      });

      // generateJoinCode skal ha blitt kalt to ganger
      expect(mockGenerateJoinCode).toHaveBeenCalledTimes(2);

      // Sesjon fra andre forsøk
      expect(returnedSession).toEqual(successSession);
      expect(result.current.session?.join_code).toBe('YYYY');
    });

    it('ikke-23505 feil: returnerer null og setter error-melding', async () => {
      mockGenerateJoinCode.mockReturnValue('ABCD');

      chainable.single.mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      });

      const { result } = renderHook(() => useSession());

      let returnedSession = null;
      await act(async () => {
        returnedSession = await result.current.createSession('Ola Nordmann');
      });

      expect(returnedSession).toBeNull();
      expect(result.current.error).not.toBeNull();
    });
  });

  // -------------------------------------------------------
  // joinSession
  // -------------------------------------------------------

  describe('joinSession', () => {
    it('gyldig kode: finner sesjon, registrerer deltaker, returnerer true', async () => {
      const memberSession = { ...MOCK_SESSION, join_code: 'EFGH' };
      const memberParticipant = { ...MOCK_PARTICIPANT, role: 'participant' as const };

      chainable.single
        .mockResolvedValueOnce({ data: memberSession, error: null })
        .mockResolvedValueOnce({ data: memberParticipant, error: null });

      const { result } = renderHook(() => useSession());

      let success = false;
      await act(async () => {
        success = await result.current.joinSession('EFGH', 'Kari Nordmann');
      });

      expect(success).toBe(true);
      expect(result.current.session).toEqual(memberSession);
      expect(result.current.localParticipant?.role).toBe('participant');

      // sessionStorage er skrevet
      const stored = sessionStorage.getItem('estimering_participant');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.name).toBe('Kari Nordmann');
    });

    it('ugyldig kode: sessions-lookup returnerer error, returnerer false', async () => {
      chainable.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      const { result } = renderHook(() => useSession());

      let success = true;
      await act(async () => {
        success = await result.current.joinSession('ZZZZ', 'Kari Nordmann');
      });

      expect(success).toBe(false);
      expect(result.current.session).toBeNull();
      expect(result.current.error).not.toBeNull();
    });

    it('normaliserer kode til uppercase ved eq-oppslag', async () => {
      chainable.single
        .mockResolvedValueOnce({ data: MOCK_SESSION, error: null })
        .mockResolvedValueOnce({ data: MOCK_PARTICIPANT, error: null });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.joinSession('abcd', 'Kari');
      });

      expect(chainable.eq).toHaveBeenCalledWith('join_code', 'ABCD');
    });
  });

  // -------------------------------------------------------
  // Gjenoppretting fra sessionStorage
  // -------------------------------------------------------

  describe('gjenoppretting fra sessionStorage', () => {
    it('gjenoppretter sesjon fra DB når sessionStorage har data', async () => {
      const localData = {
        participantId: MOCK_PARTICIPANT.id,
        sessionId: MOCK_SESSION.id,
        name: 'Ola Nordmann',
        role: 'facilitator',
      };
      sessionStorage.setItem('estimering_participant', JSON.stringify(localData));

      chainable.single.mockResolvedValueOnce({ data: MOCK_SESSION, error: null });

      const { result } = renderHook(() => useSession());

      await waitFor(() => {
        expect(result.current.initialized).toBe(true);
      });

      expect(result.current.session).toEqual(MOCK_SESSION);
      expect(result.current.localParticipant?.participantId).toBe(MOCK_PARTICIPANT.id);
    });

    it('rydder storage når DB-fetch feiler under gjenoppretting', async () => {
      const localData = {
        participantId: MOCK_PARTICIPANT.id,
        sessionId: MOCK_SESSION.id,
        name: 'Ola Nordmann',
        role: 'facilitator',
      };
      sessionStorage.setItem('estimering_participant', JSON.stringify(localData));

      chainable.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      const { result } = renderHook(() => useSession());

      await waitFor(() => {
        expect(result.current.initialized).toBe(true);
      });

      expect(result.current.session).toBeNull();
      expect(result.current.localParticipant).toBeNull();
      expect(sessionStorage.getItem('estimering_participant')).toBeNull();
    });

    it('initialized blir true selv uten sessionStorage', async () => {
      const { result } = renderHook(() => useSession());

      await waitFor(() => {
        expect(result.current.initialized).toBe(true);
      });

      expect(result.current.session).toBeNull();
    });
  });

  // -------------------------------------------------------
  // Sesjonsoperasjoner
  // -------------------------------------------------------

  describe('startSession', () => {
    it('kaller update med { started: true } og riktig session id', async () => {
      const { result } = renderHook(() => useSession());
      await setupCreatedSession(result);

      chainable.update.mockClear();
      chainable.eq.mockClear();
      chainable.eq.mockResolvedValue({ error: null });

      await act(async () => {
        await result.current.startSession();
      });

      expect(chainable.update).toHaveBeenCalledWith({ started: true });
      expect(chainable.eq).toHaveBeenCalledWith('id', MOCK_SESSION.id);
    });
  });

  describe('revealVotes', () => {
    it('kaller update med { votes_revealed: true }', async () => {
      const { result } = renderHook(() => useSession());
      await setupCreatedSession(result);

      chainable.update.mockClear();
      chainable.eq.mockClear();
      chainable.eq.mockResolvedValue({ error: null });

      await act(async () => {
        await result.current.revealVotes();
      });

      expect(chainable.update).toHaveBeenCalledWith({ votes_revealed: true });
      expect(chainable.eq).toHaveBeenCalledWith('id', MOCK_SESSION.id);
    });
  });

  describe('nextRound', () => {
    it('kaller update med { current_round: 2, votes_revealed: false }', async () => {
      const { result } = renderHook(() => useSession());
      await setupCreatedSession(result);

      chainable.update.mockClear();
      chainable.eq.mockClear();
      chainable.eq.mockResolvedValue({ error: null });

      await act(async () => {
        await result.current.nextRound();
      });

      // MOCK_SESSION.current_round = 1, neste runde = 2
      expect(chainable.update).toHaveBeenCalledWith({
        current_round: 2,
        votes_revealed: false,
      });
      expect(chainable.eq).toHaveBeenCalledWith('id', MOCK_SESSION.id);
    });
  });

  describe('endSession', () => {
    it('kaller update med { status: "completed" }', async () => {
      const { result } = renderHook(() => useSession());
      await setupCreatedSession(result);

      chainable.update.mockClear();
      chainable.eq.mockClear();
      chainable.eq.mockResolvedValue({ error: null });

      await act(async () => {
        await result.current.endSession();
      });

      expect(chainable.update).toHaveBeenCalledWith({ status: 'completed' });
      expect(chainable.eq).toHaveBeenCalledWith('id', MOCK_SESSION.id);
    });
  });

  // -------------------------------------------------------
  // logout
  // -------------------------------------------------------

  describe('logout', () => {
    it('rydder sessionStorage og nullstiller state', async () => {
      const { result } = renderHook(() => useSession());
      await setupCreatedSession(result);

      expect(result.current.session).not.toBeNull();
      expect(sessionStorage.getItem('estimering_participant')).not.toBeNull();

      act(() => {
        result.current.logout();
      });

      expect(result.current.session).toBeNull();
      expect(result.current.localParticipant).toBeNull();
      expect(sessionStorage.getItem('estimering_participant')).toBeNull();
    });
  });

  // -------------------------------------------------------
  // initialized-state
  // -------------------------------------------------------

  describe('initialized', () => {
    it('er false initialt mens DB-fetch pågår, true etterpå', async () => {
      const localData = {
        participantId: MOCK_PARTICIPANT.id,
        sessionId: MOCK_SESSION.id,
        name: 'Ola Nordmann',
        role: 'facilitator',
      };
      sessionStorage.setItem('estimering_participant', JSON.stringify(localData));

      // Delay DB-fetch for å observere initialized=false
      let resolveDbFetch!: (val: { data: typeof MOCK_SESSION; error: null }) => void;
      const dbFetchPromise = new Promise<{ data: typeof MOCK_SESSION; error: null }>((resolve) => {
        resolveDbFetch = resolve;
      });
      chainable.single.mockReturnValueOnce(dbFetchPromise);

      const { result } = renderHook(() => useSession());

      // Rett etter mount: initialized skal være false
      expect(result.current.initialized).toBe(false);

      // Løs DB-fetch
      await act(async () => {
        resolveDbFetch({ data: MOCK_SESSION, error: null });
        await dbFetchPromise;
      });

      await waitFor(() => {
        expect(result.current.initialized).toBe(true);
      });
    });
  });
});

// Eksporter ingenting – test-only fil
export {};
