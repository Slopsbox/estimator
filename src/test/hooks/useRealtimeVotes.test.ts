import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Vote } from '../../lib/types';

// ============================================================
// vi.hoisted() – variabler tilgjengelige i vi.mock()-factory
// ============================================================

const { chainable, channelMock } = vi.hoisted(() => {
  let subscribeCb: ((status: string) => void) | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelMock: Record<string, any> = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockImplementation((cb?: (status: string) => void) => {
      subscribeCb = cb;
      return channelMock;
    }),
    // Eksponerer subscribeCb for testing
    _triggerSubscribed: () => subscribeCb?.('SUBSCRIBED'),
    _getSubscribeCb: () => subscribeCb,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chainable: Record<string, any> = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then: vi.fn().mockImplementation((cb: (r: any) => void) => {
      cb({ data: [], error: null });
      return Promise.resolve();
    }),
    channel: vi.fn().mockReturnValue(channelMock),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  };

  ['from', 'select', 'eq', 'order'].forEach((m) => chainable[m].mockReturnValue(chainable));

  return { chainable, channelMock };
});

vi.mock('../../lib/supabase', () => ({ supabase: chainable }));

import { useRealtimeVotes } from '../../hooks/useRealtimeVotes';

// ============================================================
// Hjelpere
// ============================================================

function resetChainable() {
  vi.clearAllMocks();

  ['from', 'select', 'eq', 'order'].forEach((m) => chainable[m].mockReturnValue(chainable));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chainable.then.mockImplementation((cb: (r: any) => void) => {
    cb({ data: [], error: null });
    return Promise.resolve();
  });

  chainable.single.mockResolvedValue({ data: null, error: null });

  let subscribeCb: ((status: string) => void) | undefined;
  channelMock.on.mockReturnThis();
  channelMock.subscribe.mockImplementation((cb?: (status: string) => void) => {
    subscribeCb = cb;
    return channelMock;
  });
  channelMock._triggerSubscribed = () => subscribeCb?.('SUBSCRIBED');
  channelMock._getSubscribeCb = () => subscribeCb;
  chainable.channel.mockReturnValue(channelMock);
  chainable.removeChannel.mockResolvedValue(undefined);
}

// Faste testdata
const SESSION_ID = 'session-abc';
const CURRENT_ROUND = 1;

function makeVote(overrides: Partial<Vote> = {}): Vote {
  return {
    id: 'vote-001',
    session_id: SESSION_ID,
    participant_id: 'participant-001',
    round: CURRENT_ROUND,
    size: 'm',
    value: 'gold',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ============================================================
// Tester
// ============================================================

describe('useRealtimeVotes', () => {
  beforeEach(() => {
    resetChainable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returnerer tom array og loading=false for null sessionId', async () => {
    const { result } = renderHook(() => useRealtimeVotes(null, 1));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.votes).toEqual([]);
  });

  it('henter initial votes umiddelbart på privat session-topic', async () => {
    const initialVotes = [makeVote({ id: 'vote-001' }), makeVote({ id: 'vote-002' })];

    // .then() trigges når fetchInitialData kalles (etter SUBSCRIBED)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: initialVotes, error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.votes).toHaveLength(2);
    expect(result.current.votes[0].id).toBe('vote-001');
    expect(chainable.channel).toHaveBeenCalledWith(`votes:${SESSION_ID}:${CURRENT_ROUND}:0`, {
      config: { private: true },
    });
  });

  it('replayer INSERT som skjer mens initial fetch er in-flight uten å abonnere på DELETE', async () => {
    let resolveFetch!: (result: { data: Vote[]; error: null }) => void;
    chainable.then.mockImplementation((resolve: typeof resolveFetch) => {
      resolveFetch = resolve;
      return Promise.resolve();
    });
    const inserted = makeVote({ id: 'vote-new' });
    const { result } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));
    await waitFor(() => expect(resolveFetch).toBeTypeOf('function'));
    const calls = channelMock.on.mock.calls as Array<[string, { event: string }, (payload: { new: Vote; old: Vote }) => void]>;
    const insert = calls.find((call) => call[1].event === 'INSERT')?.[2];

    act(() => {
      insert?.({ new: inserted, old: inserted });
    });
    await act(async () => resolveFetch({ data: [], error: null }));

    expect(result.current.votes).toEqual([inserted]);
    expect(calls.map((call) => call[1].event)).toEqual(['INSERT']);
  });

  it('utleder egen stemme når participantId gis', async () => {
    chainable.then.mockImplementation((cb: (r: { data: Vote[]; error: null }) => void) => {
      cb({ data: [makeVote({ participant_id: 'participant-own' })], error: null });
      return Promise.resolve();
    });
    const { result } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND, false, 'participant-own'));

    act(() => channelMock._triggerSubscribed());

    await waitFor(() => expect(result.current.ownVote?.participant_id).toBe('participant-own'));
  });

  it('beholder votes ved CLOSED mens samme scope reconnecter', async () => {
    vi.useFakeTimers();
    try {
      chainable.then.mockImplementation((cb: (r: { data: Vote[]; error: null }) => void) => {
        cb({ data: [makeVote()], error: null });
        return Promise.resolve();
      });
      const { result } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));
      act(() => channelMock._triggerSubscribed());
      await act(async () => { await Promise.resolve(); });
      expect(result.current.votes).toHaveLength(1);

      act(() => channelMock._getSubscribeCb()?.('CLOSED'));
      expect(result.current.connectionState).toBe('disconnected');
      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });
      expect(result.current.votes).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('legger til ny stemme fra realtime INSERT-event', async () => {
    const initialVotes = [makeVote({ id: 'vote-001' })];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: initialVotes, error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Hent INSERT-handler fra channel.on() og simuler ny stemme
    const onCalls = channelMock.on.mock.calls as Array<[string, unknown, (payload: { new: Vote }) => void]>;
    const insertHandler = onCalls.find(([_event, config]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (config as any)?.event === 'INSERT';
    });
    expect(insertHandler).toBeDefined();
    const handler = insertHandler![2];

    const newVote = makeVote({ id: 'vote-002', size: 'l', value: 'silver' });
    act(() => {
      handler({ new: newVote });
    });

    expect(result.current.votes).toHaveLength(2);
    expect(result.current.votes[1].id).toBe('vote-002');
  });

  it('unngår duplikater (samme vote id sendes to ganger)', async () => {
    const initialVotes: Vote[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: initialVotes, error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const onCalls = channelMock.on.mock.calls as Array<[string, unknown, (payload: { new: Vote }) => void]>;
    const insertHandler = onCalls.find(([_e, config]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config as any)?.event === 'INSERT'
    );
    const handler = insertHandler![2];

    const vote = makeVote({ id: 'vote-dup' });

    act(() => {
      handler({ new: vote });
      handler({ new: vote }); // duplikat
    });

    expect(result.current.votes).toHaveLength(1);
  });

  it('filtrerer ut stemmer fra feil runde', async () => {
    const initialVotes: Vote[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: initialVotes, error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const onCalls = channelMock.on.mock.calls as Array<[string, unknown, (payload: { new: Vote }) => void]>;
    const insertHandler = onCalls.find(([_e, config]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config as any)?.event === 'INSERT'
    );
    const handler = insertHandler![2];

    // Stemme fra runde 2 (ikke gjeldende runde 1) skal ignoreres
    const wrongRoundVote = makeVote({ id: 'vote-wrong-round', round: 2 });
    act(() => {
      handler({ new: wrongRoundVote });
    });

    expect(result.current.votes).toHaveLength(0);
  });

  it('cleanup: fjerner channel ved unmount', async () => {
    const { unmount } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));

    act(() => {
      channelMock._triggerSubscribed();
    });

    unmount();

    expect(chainable.removeChannel).toHaveBeenCalledWith(channelMock);
  });

  it('kjører ikke reconnect-timer etter unmount', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));

    act(() => {
      channelMock._getSubscribeCb()?.('CHANNEL_ERROR');
    });
    unmount();
    act(() => vi.advanceTimersByTime(2000));

    expect(chainable.channel).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('re-fetcher stemmer ved online-event (visibility refetch)', async () => {
    const initialVotes = [makeVote({ id: 'vote-001' })];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: initialVotes, error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Oppdater mock til å returnere en ekstra stemme ved re-fetch
    const updatedVotes = [makeVote({ id: 'vote-001' }), makeVote({ id: 'vote-002' })];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: updatedVotes, error: null });
      return Promise.resolve();
    });

    // Simuler online-event → trigger re-fetch
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(result.current.votes).toHaveLength(2);
    });
  });

  it('nullstiller tidligere fetch-feil etter vellykket refetch', async () => {
    chainable.then.mockImplementationOnce((cb: (r: { data: null; error: object }) => void) => {
      cb({ data: null, error: { code: 'network' } });
      return Promise.resolve();
    });
    const { result } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    chainable.then.mockImplementation((cb: (r: { data: Vote[]; error: null }) => void) => {
      cb({ data: [makeVote()], error: null });
      return Promise.resolve();
    });
    await act(async () => { await result.current.refetch(); });

    expect(result.current.error).toBeNull();
    expect(result.current.votes).toEqual([makeVote()]);
  });
});

export {};
