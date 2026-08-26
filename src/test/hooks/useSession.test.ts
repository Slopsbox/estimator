import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CREATE_REQUEST_ID_STORAGE_KEY, LOCAL_PARTICIPANT_STORAGE_KEY } from '../../lib/localStorage';

const {
  roomMocks,
  estimationMocks,
  storageMocks,
  channelMock,
  removeChannelMock,
} = vi.hoisted(() => {
  let subscription: ((status: string) => void) | undefined;
  const channelMock = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn((callback: (status: string) => void) => {
      subscription = callback;
      return channelMock;
    }),
    trigger: (status: string) => subscription?.(status),
  };
  return {
    roomMocks: {
      create: vi.fn(), createHealth: vi.fn(), join: vi.fn(), restore: vi.fn(), leave: vi.fn(), persist: vi.fn(),
    },
    estimationMocks: {
      start: vi.fn(), reveal: vi.fn(), next: vi.fn(), end: vi.fn(),
      claim: vi.fn(), cast: vi.fn(), retract: vi.fn(),
    },
    storageMocks: {
      readSessionPointer: vi.fn(), writeSessionPointer: vi.fn(), clearSessionPointer: vi.fn(),
      getOrCreateCreateRequestId: vi.fn(), clearCreateRequestId: vi.fn(), writeLastUsedName: vi.fn(),
    },
    channelMock,
    removeChannelMock: vi.fn(),
  };
});

vi.mock('../../app/sessionServices', () => ({
  sessionServices: {
    roomMembership: roomMocks,
    estimation: estimationMocks,
    storage: storageMocks,
    realtime: {
      channel: vi.fn(() => channelMock),
      removeChannel: removeChannelMock,
    },
  },
}));

import { sessionServices } from '../../app/sessionServices';
import { SessionProvider } from '../../hooks/SessionProvider';
import { useSession } from '../../hooks/useSession';

const SESSION = {
  activity_type: 'estimation' as const,
  id: 'session-1', status: 'active', current_round: 1, created_at: '2026-01-01T00:00:00Z',
  join_code: 'ABCD', votes_revealed: false, started: true, consensus_streak: 0,
};
const PARTICIPANT = {
  id: 'participant-1', session_id: SESSION.id, name: 'Kari', role: 'participant' as const,
  joined_at: '2026-01-01T00:00:00Z', left_at: null,
};
const LOCAL_PARTICIPANT = {
  participantId: PARTICIPANT.id, sessionId: SESSION.id, name: PARTICIPANT.name, role: PARTICIPANT.role,
};
const ROUND_PARTICIPANT = {
  session_id: SESSION.id, round: 1, participant_id: PARTICIPANT.id,
  joined_at: '2026-01-01T00:00:00Z', reestimate_used: false,
};
const VOTE = {
  id: 'vote-1', session_id: SESSION.id, participant_id: PARTICIPANT.id, round: 1,
  size: 'm' as const, value: 'gold' as const, created_at: '2026-01-01T00:00:00Z',
};

function pointer(activityType: 'estimation' | 'health_check' = 'estimation') {
  return { version: 2 as const, activityType, ...LOCAL_PARTICIPANT };
}

function snapshot(activityType: 'estimation' | 'health_check' = 'estimation') {
  return {
    session: SESSION,
    participant: PARTICIPANT,
    localParticipant: LOCAL_PARTICIPANT,
    pointer: pointer(activityType),
    activityType,
    ownVote: VOTE,
    roundParticipant: ROUND_PARTICIPANT,
  };
}

function storePointer() {
  localStorage.setItem(LOCAL_PARTICIPANT_STORAGE_KEY, JSON.stringify(pointer()));
}

function wrapper({ children }: PropsWithChildren) {
  return createElement(SessionProvider, null, children);
}

describe('SessionProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    storageMocks.readSessionPointer.mockImplementation(() => {
      const stored = localStorage.getItem(LOCAL_PARTICIPANT_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    });
    storageMocks.writeSessionPointer.mockImplementation((value) => {
      localStorage.setItem(LOCAL_PARTICIPANT_STORAGE_KEY, JSON.stringify(value));
    });
    storageMocks.clearSessionPointer.mockImplementation(() => {
      localStorage.removeItem(LOCAL_PARTICIPANT_STORAGE_KEY);
    });
    storageMocks.getOrCreateCreateRequestId.mockImplementation(() => {
      const existing = localStorage.getItem(CREATE_REQUEST_ID_STORAGE_KEY);
      if (existing) return existing;
      localStorage.setItem(CREATE_REQUEST_ID_STORAGE_KEY, 'request-1');
      return 'request-1';
    });
    storageMocks.clearCreateRequestId.mockImplementation(() => {
      localStorage.removeItem(CREATE_REQUEST_ID_STORAGE_KEY);
    });
    roomMocks.persist.mockImplementation((value, options) => {
      storageMocks.writeSessionPointer(value.pointer);
      if (options?.clearCreateRequestId) storageMocks.clearCreateRequestId();
      if (options?.rememberName) storageMocks.writeLastUsedName(value.participant.name);
    });
    roomMocks.restore.mockResolvedValue({ ok: false, reason: 'rpc' });
    channelMock.on.mockReturnThis();
    channelMock.subscribe.mockImplementation((callback: (status: string) => void) => {
      channelMock.trigger = (status: string) => callback(status);
      queueMicrotask(() => callback('SUBSCRIBED'));
      return channelMock;
    });
  });

  it('useSession kaster en meningsfull feil uten provider', () => {
    expect(() => renderHook(() => useSession())).toThrow('useSession må brukes innenfor SessionProvider');
  });

  it('gjenoppretter og persisterer autoritativt snapshot', async () => {
    storePointer();
    roomMocks.restore.mockResolvedValueOnce({ ok: true, snapshot: snapshot('health_check') });

    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));

    expect(roomMocks.restore).toHaveBeenCalledWith(SESSION.id);
    expect(roomMocks.persist).toHaveBeenCalledWith(snapshot('health_check'));
    expect(result.current).toMatchObject({
      session: SESSION,
      activityType: 'health_check',
      localParticipant: LOCAL_PARTICIPANT,
      ownVote: VOTE,
      roundParticipant: ROUND_PARTICIPANT,
      connectionState: 'connected',
    });
  });

  it('starter restore uten å vente på SUBSCRIBED', async () => {
    storePointer();
    channelMock.subscribe.mockImplementation(() => channelMock);
    roomMocks.restore.mockResolvedValueOnce({ ok: true, snapshot: snapshot() });

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    expect(sessionServices.realtime.channel).toHaveBeenCalledWith('session:session-1:session-watch:0', {
      config: { private: true },
    });
  });

  it('beholder cached identity og viser norsk feil ved transient restore-feil', async () => {
    storePointer();
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.restoreStatus).toBe('reconnecting'));

    expect(result.current.localParticipant).toEqual(LOCAL_PARTICIPANT);
    expect(result.current.error).toBe('Kunne ikke koble til sesjonen. Vi prøver igjen.');
    expect(localStorage.getItem(LOCAL_PARTICIPANT_STORAGE_KEY)).not.toBeNull();
  });

  it.each(['membership_missing', 'session_completed'] as const)('rydder lokal state ved %s', async (reason) => {
    storePointer();
    roomMocks.restore.mockResolvedValueOnce({ ok: false, reason });
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.restoreStatus).toBe('invalid'));

    expect(result.current.localParticipant).toBeNull();
    expect(storageMocks.clearSessionPointer).toHaveBeenCalledOnce();
  });

  it('retryer restore ved online-event', async () => {
    storePointer();
    roomMocks.restore
      .mockResolvedValueOnce({ ok: false, reason: 'rpc' })
      .mockResolvedValueOnce({ ok: true, snapshot: snapshot() });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('reconnecting'));

    act(() => window.dispatchEvent(new Event('online')));

    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    expect(roomMocks.restore).toHaveBeenCalledTimes(2);
  });

  it('coalescer session-event under pågående restore til ett nytt kall', async () => {
    storePointer();
    channelMock.subscribe.mockImplementation(() => channelMock);
    let resolveFirst!: (value: { ok: true; snapshot: ReturnType<typeof snapshot> }) => void;
    roomMocks.restore
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({
        ok: true,
        snapshot: { ...snapshot(), session: { ...SESSION, current_round: 2 } },
      });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(roomMocks.restore).toHaveBeenCalledTimes(1));
    const updateHandler = channelMock.on.mock.calls.find((call) => call[1].event === 'UPDATE')?.[2];

    act(() => updateHandler?.());
    await act(async () => resolveFirst({ ok: true, snapshot: snapshot() }));

    await waitFor(() => expect(roomMocks.restore).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.session?.current_round).toBe(2));
  });

  it('ignorerer stale restore etter logout uten storage-commit', async () => {
    storePointer();
    let resolveRestore!: (value: { ok: true; snapshot: ReturnType<typeof snapshot> }) => void;
    roomMocks.restore.mockReturnValueOnce(new Promise((resolve) => { resolveRestore = resolve; }));
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(roomMocks.restore).toHaveBeenCalledOnce());

    act(() => result.current.logout());
    await act(async () => resolveRestore({ ok: true, snapshot: snapshot() }));

    expect(result.current.session).toBeNull();
    expect(roomMocks.persist).not.toHaveBeenCalled();
  });

  it('create committer pointer og request-ID bare etter current suksess', async () => {
    roomMocks.create.mockResolvedValueOnce({ ok: true, snapshot: snapshot() });
    const { result } = renderHook(() => useSession(), { wrapper });

    await act(async () => { await result.current.createSession('Ola'); });

    expect(roomMocks.create).toHaveBeenCalledWith('Ola', 'request-1');
    expect(roomMocks.persist).toHaveBeenCalledWith(snapshot(), { clearCreateRequestId: true });
    expect(localStorage.getItem(CREATE_REQUEST_ID_STORAGE_KEY)).toBeNull();
    expect(result.current.session).toEqual(SESSION);
  });

  it('createHealthCheck genererer levering, committer health-pointer og rydder request-ID', async () => {
    const healthSnapshot = snapshot('health_check');
    roomMocks.createHealth.mockResolvedValueOnce({ ok: true, snapshot: healthSnapshot });
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('40000000-0000-4000-8000-000000000004');
    const { result } = renderHook(() => useSession(), { wrapper });

    await act(async () => { await result.current.createHealthCheck('Ola', 'Plattform', '2026-08-26'); });

    expect(roomMocks.createHealth).toHaveBeenCalledWith({
      name: 'Ola',
      squadName: 'Plattform',
      measurementDate: '2026-08-26',
      requestId: 'request-1',
      deliveryId: '40000000-0000-4000-8000-000000000004',
    });
    expect(roomMocks.persist).toHaveBeenCalledWith(healthSnapshot, { clearCreateRequestId: true });
    expect(result.current.activityType).toBe('health_check');
  });

  it('viser en presis melding når fasilitatoren allerede har en aktiv helsesjekk', async () => {
    roomMocks.createHealth.mockResolvedValueOnce({ ok: false, reason: 'active_session_exists' });
    const { result } = renderHook(() => useSession(), { wrapper });

    await act(async () => { await result.current.createHealthCheck('Ola', 'Plattform', '2026-08-26'); });

    expect(result.current.error).toBe(
      'Du har allerede en aktiv helsesjekk. Åpne den aktive sesjonen eller avslutt den først.',
    );
    expect(roomMocks.persist).not.toHaveBeenCalled();
  });

  it('stale create skriver ikke pointer eller rydder request-ID', async () => {
    let resolveCreate!: (value: { ok: true; snapshot: ReturnType<typeof snapshot> }) => void;
    roomMocks.create.mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve; }));
    const { result } = renderHook(() => useSession(), { wrapper });
    let createPromise!: Promise<unknown>;

    act(() => {
      createPromise = result.current.createSession('Ola');
      result.current.logout();
    });
    await act(async () => {
      resolveCreate({ ok: true, snapshot: snapshot() });
      await createPromise;
    });

    expect(roomMocks.persist).not.toHaveBeenCalled();
    expect(localStorage.getItem(CREATE_REQUEST_ID_STORAGE_KEY)).toBe('request-1');
  });

  it.each(['session_not_found', 'role_conflict'] as const)('bevarer offentlig join-resultat for %s', async (reason) => {
    roomMocks.join.mockResolvedValueOnce({ ok: false, reason });
    const { result } = renderHook(() => useSession(), { wrapper });

    await expect(act(() => result.current.joinSession('ABCD', 'Kari')))
      .resolves.toEqual({ ok: false, reason });
    expect(result.current.error).toBeNull();
  });

  it('join committer snapshot og returnerer activity type', async () => {
    roomMocks.join.mockResolvedValueOnce({ ok: true, snapshot: snapshot('health_check') });
    const { result } = renderHook(() => useSession(), { wrapper });

    let joined;
    await act(async () => { joined = await result.current.joinSession('ABCD', 'Kari'); });

    expect(joined).toEqual({ ok: true, activityType: 'health_check' });
    expect(roomMocks.persist).toHaveBeenCalledWith(snapshot('health_check'), { rememberName: true });
  });

  it('stale join etter logout lagrer verken pointer eller navn', async () => {
    let resolveJoin!: (value: { ok: true; snapshot: ReturnType<typeof snapshot> }) => void;
    roomMocks.join.mockReturnValueOnce(new Promise((resolve) => { resolveJoin = resolve; }));
    const { result } = renderHook(() => useSession(), { wrapper });
    let joinPromise!: Promise<unknown>;

    act(() => {
      joinPromise = result.current.joinSession('ABCD', 'Kari');
      result.current.logout();
    });
    await act(async () => {
      resolveJoin({ ok: true, snapshot: snapshot('health_check') });
      await joinPromise;
    });

    expect(roomMocks.persist).not.toHaveBeenCalled();
    expect(storageMocks.writeLastUsedName).not.toHaveBeenCalled();
    expect(result.current.session).toBeNull();
  });

  it('join-feil bevarer offentlig transient-resultat og norsk melding', async () => {
    roomMocks.join.mockResolvedValueOnce({ ok: false, reason: 'rpc' });
    const { result } = renderHook(() => useSession(), { wrapper });

    let joined;
    await act(async () => { joined = await result.current.joinSession('ABCD', 'Kari'); });

    expect(joined).toEqual({ ok: false, reason: 'transient' });
    expect(result.current.error).toBe('Kunne ikke koble til sesjonen. Prøv igjen.');
  });

  it.each([
    ['startSession', 'start', 'Kunne ikke starte sesjonen. Prøv igjen.'],
    ['revealVotes', 'reveal', 'Kunne ikke avsløre stemmer. Prøv igjen.'],
    ['nextRound', 'next', 'Kunne ikke starte ny runde. Prøv igjen.'],
    ['endSession', 'end', 'Kunne ikke avslutte sesjonen. Prøv igjen.'],
  ] as const)('%s bruker estimation service og anvender returnert Session', async (method, serviceMethod, message) => {
    storePointer();
    roomMocks.restore.mockResolvedValueOnce({ ok: true, snapshot: snapshot() });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    const updated = { ...SESSION, current_round: 2 };
    estimationMocks[serviceMethod].mockResolvedValueOnce({ ok: true, session: updated });

    await act(async () => { await result.current[method](); });
    expect(result.current.session).toEqual(updated);

    estimationMocks[serviceMethod].mockResolvedValueOnce({ ok: false, reason: 'malformed' });
    await act(async () => { await result.current[method](); });
    expect(result.current.error).toBe(message);
  });

  it('claim, cast og retract anvender validerte service-resultater', async () => {
    storePointer();
    roomMocks.restore.mockResolvedValueOnce({ ok: true, snapshot: snapshot() });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    estimationMocks.claim.mockResolvedValueOnce({ ok: true, roundParticipant: ROUND_PARTICIPANT });
    estimationMocks.cast.mockResolvedValueOnce({ ok: true, vote: VOTE });
    estimationMocks.retract.mockResolvedValueOnce({ ok: true });

    await act(async () => { await result.current.claimRound(); });
    await act(async () => { await result.current.castVote({ size: 'm', value: 'gold' }); });
    await act(async () => { await result.current.retractVote(); });

    expect(estimationMocks.claim).toHaveBeenCalledWith(SESSION, LOCAL_PARTICIPANT);
    expect(estimationMocks.cast).toHaveBeenCalledWith(SESSION, LOCAL_PARTICIPANT, { size: 'm', value: 'gold' });
    expect(result.current.ownVote).toBeNull();
    expect(result.current.roundParticipant?.reestimate_used).toBe(true);
  });

  it('cast identity-feil beholder gammel atferd uten restore-retry', async () => {
    storePointer();
    roomMocks.restore.mockResolvedValueOnce({ ok: true, snapshot: snapshot() });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    estimationMocks.cast.mockResolvedValueOnce({ ok: false, reason: 'identity' });

    await act(async () => { await result.current.castVote({ size: 'm', value: 'gold' }); });

    expect(roomMocks.restore).toHaveBeenCalledTimes(1);
  });

  it.each(['claim', 'cast', 'retract'] as const)('ignorerer stale %s-resultat etter logout', async (operation) => {
    storePointer();
    roomMocks.restore.mockResolvedValueOnce({ ok: true, snapshot: snapshot() });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    let resolveMutation!: (value: unknown) => void;
    estimationMocks[operation].mockReturnValueOnce(new Promise((resolve) => { resolveMutation = resolve; }));

    let mutation!: Promise<unknown>;
    act(() => {
      mutation = operation === 'claim'
        ? result.current.claimRound()
        : operation === 'cast'
          ? result.current.castVote({ size: 'm', value: 'gold' })
          : result.current.retractVote();
      result.current.logout();
      resolveMutation(operation === 'claim'
        ? { ok: true, roundParticipant: ROUND_PARTICIPANT }
        : operation === 'cast'
          ? { ok: true, vote: VOTE }
          : { ok: true });
    });
    await act(async () => { await mutation; });

    expect(result.current.session).toBeNull();
    expect(result.current.ownVote).toBeNull();
    expect(result.current.roundParticipant).toBeNull();
  });

  it('leave rydder lokal state først etter current service-suksess', async () => {
    storePointer();
    roomMocks.restore.mockResolvedValueOnce({ ok: true, snapshot: snapshot() });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    roomMocks.leave.mockResolvedValueOnce({ ok: true });

    let leaveResult;
    await act(async () => { leaveResult = await result.current.leaveSession(); });

    expect(leaveResult).toEqual({ ok: true });
    expect(roomMocks.leave).toHaveBeenCalledWith(SESSION.id);
    expect(result.current.session).toBeNull();
    expect(storageMocks.clearSessionPointer).toHaveBeenCalledOnce();
  });

  it('refetcher ved reconnectet realtime-kanal', async () => {
    storePointer();
    roomMocks.restore.mockResolvedValue({ ok: true, snapshot: snapshot() });
    renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(roomMocks.restore).toHaveBeenCalledTimes(1));

    act(() => channelMock.trigger('SUBSCRIBED'));

    await waitFor(() => expect(roomMocks.restore).toHaveBeenCalledTimes(2));
  });

  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as const)(
    'rydder gammel kanal og reconnecter etter %s',
    async (status) => {
      vi.useFakeTimers();
      try {
        storePointer();
        roomMocks.restore.mockResolvedValue({ ok: true, snapshot: snapshot() });
        const { result } = renderHook(() => useSession(), { wrapper });
        await act(async () => { await Promise.resolve(); });

        act(() => channelMock.trigger(status));
        expect(result.current.connectionState).toBe('disconnected');

        await act(async () => {
          vi.advanceTimersByTime(2000);
          await Promise.resolve();
        });

        expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
        expect(sessionServices.realtime.channel).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('starter ikke en ny retry når programmatisk channel-fjerning utløser CLOSED', async () => {
    vi.useFakeTimers();
    try {
      storePointer();
      roomMocks.restore.mockResolvedValue({ ok: true, snapshot: snapshot() });
      removeChannelMock.mockImplementation(async () => {
        channelMock.trigger('CLOSED');
      });
      renderHook(() => useSession(), { wrapper });
      await act(async () => { await Promise.resolve(); });

      act(() => channelMock.trigger('CHANNEL_ERROR'));
      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(sessionServices.realtime.channel).toHaveBeenCalledTimes(2);

      await act(async () => {
        vi.advanceTimersByTime(10000);
        await Promise.resolve();
      });

      expect(sessionServices.realtime.channel).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fjerner realtime-kanalen ved unmount', async () => {
    storePointer();
    roomMocks.restore.mockResolvedValue({ ok: true, snapshot: snapshot() });
    const { unmount } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(sessionServices.realtime.channel).toHaveBeenCalledOnce());

    unmount();

    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });
});
