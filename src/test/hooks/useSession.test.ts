import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CREATE_REQUEST_ID_STORAGE_KEY, LOCAL_PARTICIPANT_STORAGE_KEY } from '../../lib/localStorage';

const { rpcMock, ensureIdentityMock, channelMock, removeChannelMock } = vi.hoisted(() => {
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
    rpcMock: vi.fn(),
    ensureIdentityMock: vi.fn(),
    channelMock,
    removeChannelMock: vi.fn(),
  };
});

vi.mock('../../lib/supabase', () => ({
  ensureAnonymousIdentity: ensureIdentityMock,
  supabase: {
    rpc: rpcMock,
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
  },
}));

import { SessionProvider } from '../../hooks/SessionProvider';
import { useSession } from '../../hooks/useSession';

const SESSION = {
  id: 'session-1', status: 'active', current_round: 1, created_at: '2026-01-01T00:00:00Z',
  join_code: 'ABCD', votes_revealed: false, started: true, consensus_streak: 0,
};
const PARTICIPANT = {
  id: 'participant-1', session_id: 'session-1', name: 'Kari', role: 'participant',
  joined_at: '2026-01-01T00:00:00Z', left_at: null,
};
const ROUND_PARTICIPANT = {
  session_id: 'session-1', round: 1, participant_id: 'participant-1',
  joined_at: '2026-01-01T00:00:00Z', reestimate_used: false,
};
const VOTE = {
  id: 'vote-1', session_id: 'session-1', participant_id: 'participant-1', round: 1,
  size: 'm', value: 'gold', created_at: '2026-01-01T00:00:00Z',
};

function wrapper({ children }: PropsWithChildren) {
  return createElement(SessionProvider, null, children);
}

function storePointer() {
  localStorage.setItem(LOCAL_PARTICIPANT_STORAGE_KEY, JSON.stringify({
    version: 1, sessionId: SESSION.id, participantId: PARTICIPANT.id,
    name: 'Cached name', role: 'participant',
  }));
}

function okRestore() {
  return { data: { status: 'ok', session: SESSION, participant: PARTICIPANT, vote: VOTE, round_participant: ROUND_PARTICIPANT }, error: null };
}

describe('SessionProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    ensureIdentityMock.mockResolvedValue({ id: 'user-1' });
    rpcMock.mockResolvedValue({ data: null, error: null });
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

  it('gjenoppretter autoritativ session, participant, vote og round membership', async () => {
    storePointer();
    rpcMock.mockResolvedValueOnce(okRestore());
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));

    expect(result.current.session).toEqual(SESSION);
    expect(result.current.localParticipant?.name).toBe('Kari');
    expect(result.current.ownVote).toEqual(VOTE);
    expect(result.current.roundParticipant).toEqual(ROUND_PARTICIPANT);
  });

  it('starter restore uten å vente på SUBSCRIBED', async () => {
    storePointer();
    channelMock.subscribe.mockImplementation(() => channelMock);
    rpcMock.mockResolvedValueOnce(okRestore());

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    expect(result.current.session).toEqual(SESSION);
    expect((await import('../../lib/supabase')).supabase.channel).toHaveBeenCalledWith('session:session-1:session-watch:0', {
      config: { private: true },
    });
  });

  it('beholder pointer og cached identity ved transient restore-feil', async () => {
    storePointer();
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'PGRST000' } });
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.restoreStatus).toBe('reconnecting'));

    expect(result.current.localParticipant?.name).toBe('Cached name');
    expect(localStorage.getItem(LOCAL_PARTICIPANT_STORAGE_KEY)).not.toBeNull();
  });

  it.each(['membership_missing', 'session_completed'])('rydder pointer ved %s', async (status) => {
    storePointer();
    rpcMock.mockResolvedValueOnce({ data: { status }, error: null });
    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => expect(result.current.restoreStatus).toBe('invalid'));

    expect(result.current.localParticipant).toBeNull();
    expect(localStorage.getItem(LOCAL_PARTICIPANT_STORAGE_KEY)).toBeNull();
  });

  it('retry på online lykkes etter transient feil', async () => {
    storePointer();
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'network' } }).mockResolvedValueOnce(okRestore());
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('reconnecting'));

    act(() => window.dispatchEvent(new Event('online')));

    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    expect(result.current.ownVote).toEqual(VOTE);
  });

  it('kjører en ny restore når session-event kommer under pågående restore', async () => {
    storePointer();
    channelMock.subscribe.mockImplementation(() => channelMock);
    const staleSession = { ...SESSION, current_round: 1 };
    const currentSession = { ...SESSION, current_round: 2 };
    let resolveFirst!: (value: ReturnType<typeof okRestore>) => void;
    rpcMock
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({
        data: {
          ...okRestore().data,
          session: currentSession,
          vote: null,
          round_participant: { ...ROUND_PARTICIPANT, round: 2 },
        },
        error: null,
      });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    const updateHandler = channelMock.on.mock.calls.find((call) => call[1].event === 'UPDATE')?.[2] as (() => void) | undefined;

    act(() => updateHandler?.());
    await act(async () => resolveFirst({
      data: { ...okRestore().data, session: staleSession },
      error: null,
    }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.session?.current_round).toBe(2));
  });

  it('ignorerer stale restore etter logout', async () => {
    storePointer();
    let resolveRestore!: (value: ReturnType<typeof okRestore>) => void;
    rpcMock.mockReturnValueOnce(new Promise((resolve) => { resolveRestore = resolve; }));
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(ensureIdentityMock).toHaveBeenCalled());

    act(() => result.current.logout());
    await act(async () => resolveRestore(okRestore()));

    expect(result.current.session).toBeNull();
    expect(result.current.localParticipant).toBeNull();
  });

  it('create bruker stabil request-ID og rydder den bare ved bekreftet suksess', async () => {
    const createPayload = { status: 'ok', session: SESSION, participant: { ...PARTICIPANT, role: 'facilitator' }, round_participant: ROUND_PARTICIPANT };
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'network' } });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));

    await act(async () => { await result.current.createSession('Ola'); });
    const firstRequest = rpcMock.mock.calls.find((call) => call[0] === 'create_session')?.[1].p_request_id;
    rpcMock.mockResolvedValueOnce({ data: createPayload, error: null });
    await act(async () => { await result.current.createSession('Ola'); });

    const createCalls = rpcMock.mock.calls.filter((call) => call[0] === 'create_session');
    expect(createCalls[1][1].p_request_id).toBe(firstRequest);
    expect(result.current.session).toEqual(SESSION);
    expect(localStorage.getItem(CREATE_REQUEST_ID_STORAGE_KEY)).toBeNull();
  });

  it('join skiller ugyldig kode fra transient feil', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    rpcMock.mockResolvedValueOnce({ data: { status: 'session_not_found' }, error: null });
    let invalidResult: Awaited<ReturnType<typeof result.current.joinSession>> | undefined;
    await act(async () => { invalidResult = await result.current.joinSession('ZZZZ', 'Kari'); });
    expect(invalidResult).toEqual({ ok: false, reason: 'session_not_found' });
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'network' } });
    let transientResult: Awaited<ReturnType<typeof result.current.joinSession>> | undefined;
    await act(async () => { transientResult = await result.current.joinSession('ABCD', 'Kari'); });
    expect(transientResult).toEqual({ ok: false, reason: 'transient' });
  });

  it('join returnerer eksplisitt rolle-konflikt', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    rpcMock.mockResolvedValueOnce({ data: { status: 'role_conflict' }, error: null });

    let joinResult: Awaited<ReturnType<typeof result.current.joinSession>> | undefined;
    await act(async () => { joinResult = await result.current.joinSession('ABCD', 'Kari'); });

    expect(joinResult).toEqual({ ok: false, reason: 'role_conflict' });
  });

  it('cast duplicate er idempotent suksess og oppdaterer ownVote', async () => {
    storePointer();
    rpcMock.mockResolvedValueOnce(okRestore());
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    rpcMock.mockResolvedValueOnce({ data: { status: 'duplicate', vote: VOTE }, error: null });

    let castResult: Awaited<ReturnType<typeof result.current.castVote>> | undefined;
    await act(async () => { castResult = await result.current.castVote({ size: 'm', value: 'gold' }); });
    expect(castResult).toEqual({ ok: true });
    expect(result.current.ownVote).toEqual(VOTE);
  });

  it.each([
    ['startSession', 'start_session'],
    ['revealVotes', 'reveal_votes'],
    ['nextRound', 'next_round'],
    ['endSession', 'end_session'],
  ] as const)('%s bruker RPC og setter returnert session', async (method, rpcName) => {
    storePointer();
    rpcMock.mockResolvedValueOnce(okRestore());
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    const updated = { ...SESSION, current_round: 2, votes_revealed: true };
    rpcMock.mockResolvedValueOnce({ data: { status: 'ok', session: updated }, error: null });

    let mutationResult: { ok: boolean } | undefined;
    await act(async () => { mutationResult = await result.current[method](); });

    expect(mutationResult).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenLastCalledWith(rpcName, { p_session_id: SESSION.id });
    expect(result.current.session).toEqual(updated);
  });

  it('claimRound bruker RPC og setter roundParticipant', async () => {
    storePointer();
    rpcMock.mockResolvedValueOnce(okRestore());
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    const claimed = { ...ROUND_PARTICIPANT };
    rpcMock.mockResolvedValueOnce({ data: { status: 'ok', round_participant: claimed }, error: null });

    let claimResult: { ok: boolean } | undefined;
    await act(async () => { claimResult = await result.current.claimRound(); });

    expect(claimResult).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenLastCalledWith('claim_round', { p_session_id: SESSION.id });
    expect(result.current.roundParticipant).toEqual(claimed);
  });

  it('avviser malformed og cross-scope RPC payloads', async () => {
    storePointer();
    rpcMock.mockResolvedValueOnce(okRestore());
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));

    rpcMock.mockResolvedValueOnce({ data: { status: 'ok', session: { ...SESSION, id: 'other-session' } }, error: null });
    let startResult: Awaited<ReturnType<typeof result.current.startSession>> | undefined;
    await act(async () => { startResult = await result.current.startSession(); });
    expect(startResult).toEqual({
      ok: false,
      message: 'Kunne ikke starte sesjonen. Prøv igjen.',
    });

    rpcMock.mockResolvedValueOnce({ data: { status: 'ok', round_participant: { ...ROUND_PARTICIPANT, participant_id: 'other' } }, error: null });
    let claimResult: Awaited<ReturnType<typeof result.current.claimRound>> | undefined;
    await act(async () => { claimResult = await result.current.claimRound(); });
    expect(claimResult).toEqual({
      ok: false,
      message: 'Kunne ikke klargjøre runden. Prøv igjen.',
    });

    rpcMock.mockResolvedValueOnce({ data: { status: 'ok', vote: { ...VOTE, round: 2 } }, error: null });
    let castResult: Awaited<ReturnType<typeof result.current.castVote>> | undefined;
    await act(async () => { castResult = await result.current.castVote({ size: 'm', value: 'gold' }); });
    expect(castResult).toEqual({
      ok: false,
      message: 'Kunne ikke registrere stemme. Prøv igjen.',
    });
  });

  it.each(['claimRound', 'castVote', 'retractVote'] as const)('ignorerer stale %s-svar etter logout', async (method) => {
    storePointer();
    rpcMock.mockResolvedValueOnce(okRestore());
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    let resolveMutation!: (value: { data: Record<string, unknown>; error: null }) => void;
    rpcMock.mockReturnValueOnce(new Promise((resolve) => { resolveMutation = resolve; }));

    let mutation: Promise<unknown>;
    await act(async () => {
      mutation = method === 'castVote'
        ? result.current.castVote({ size: 'm', value: 'gold' })
        : result.current[method]();
      result.current.logout();
      resolveMutation({
        data: method === 'claimRound'
          ? { status: 'ok', round_participant: ROUND_PARTICIPANT }
          : method === 'castVote'
            ? { status: 'ok', vote: VOTE }
            : { status: 'ok' },
        error: null,
      });
      await mutation!;
    });

    expect(result.current.session).toBeNull();
    expect(result.current.ownVote).toBeNull();
    expect(result.current.roundParticipant).toBeNull();
  });

  it('retract nuller vote og markerer reestimate brukt', async () => {
    storePointer();
    rpcMock.mockResolvedValueOnce(okRestore());
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    rpcMock.mockResolvedValueOnce({ data: { status: 'ok' }, error: null });

    let retractResult: Awaited<ReturnType<typeof result.current.retractVote>> | undefined;
    await act(async () => { retractResult = await result.current.retractVote(); });
    expect(retractResult).toEqual({ ok: true });
    expect(result.current.ownVote).toBeNull();
    expect(result.current.roundParticipant?.reestimate_used).toBe(true);
  });

  it('refetcher restore når session-kanalen blir SUBSCRIBED', async () => {
    storePointer();
    rpcMock.mockResolvedValue(okRestore());
    renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    act(() => channelMock.trigger('SUBSCRIBED'));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
  });

  it('leaveSession kaller RPC og rydder app-state uten auth signOut', async () => {
    storePointer();
    rpcMock.mockResolvedValueOnce(okRestore());
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.restoreStatus).toBe('ready'));
    rpcMock.mockResolvedValueOnce({ data: { status: 'ok' }, error: null });

    let leaveResult: Awaited<ReturnType<typeof result.current.leaveSession>> | undefined;
    await act(async () => { leaveResult = await result.current.leaveSession(); });

    expect(leaveResult).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenLastCalledWith('leave_session', { p_session_id: SESSION.id });
    expect(result.current.session).toBeNull();
    expect(localStorage.getItem(LOCAL_PARTICIPANT_STORAGE_KEY)).toBeNull();
  });
});
