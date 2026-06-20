import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Vote } from '../../lib/types';

// ============================================================
// vi.hoisted() – variabler tilgjengelige i vi.mock()-factory
// ============================================================

const { chainable, channelMock } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  it('henter initial votes etter subscription bekreftes (SUBSCRIBED)', async () => {
    const initialVotes = [makeVote({ id: 'vote-001' }), makeVote({ id: 'vote-002' })];

    // .then() trigges når fetchInitialData kalles (etter SUBSCRIBED)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: initialVotes, error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));

    // Trigger SUBSCRIBED-callback
    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.votes).toHaveLength(2);
    expect(result.current.votes[0].id).toBe('vote-001');
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
});

export {};
