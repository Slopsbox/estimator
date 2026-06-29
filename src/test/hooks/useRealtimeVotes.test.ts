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

  it('fjerner stemme fra state ved realtime DELETE-event', async () => {
    const initialVote = makeVote({ id: 'vote-001', participant_id: 'participant-001' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: [initialVote], error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.votes).toHaveLength(1);
    });

    // Hent DELETE-handler fra channel.on() og simuler sletting
    const onCalls = channelMock.on.mock.calls as Array<[string, unknown, (payload: { old: { id: string; participant_id?: string } }) => void]>;
    const deleteHandler = onCalls.find(([_e, config]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config as any)?.event === 'DELETE'
    );
    expect(deleteHandler).toBeDefined();
    const handler = deleteHandler![2];

    act(() => {
      handler({ old: { id: 'vote-001', participant_id: 'participant-001' } });
    });

    expect(result.current.votes).toHaveLength(0);
  });

  it('trackes deltaker i deletedParticipantIds ved DELETE-event', async () => {
    const initialVote = makeVote({ id: 'vote-001', participant_id: 'participant-001' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: [initialVote], error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.votes).toHaveLength(1);
    });

    // Verifiser at deltaker IKKE er i deletedParticipantIds ennå
    expect(result.current.deletedParticipantIds.has('participant-001')).toBe(false);

    const onCalls = channelMock.on.mock.calls as Array<[string, unknown, (payload: { old: { id: string; participant_id?: string } }) => void]>;
    const deleteHandler = onCalls.find(([_e, config]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config as any)?.event === 'DELETE'
    );
    const handler = deleteHandler![2];

    act(() => {
      handler({ old: { id: 'vote-001', participant_id: 'participant-001' } });
    });

    // Deltaker skal nå være tracket som "re-estimerer"
    expect(result.current.deletedParticipantIds.has('participant-001')).toBe(true);
    // Stemmen er fjernet
    expect(result.current.votes).toHaveLength(0);
  });

  it('ignorerer DELETE-event uten id', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: [makeVote({ id: 'vote-001' })], error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeVotes(SESSION_ID, CURRENT_ROUND));

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.votes).toHaveLength(1);
    });

    const onCalls = channelMock.on.mock.calls as Array<[string, unknown, (payload: { old: Record<string, unknown> }) => void]>;
    const deleteHandler = onCalls.find(([_e, config]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config as any)?.event === 'DELETE'
    );
    const handler = deleteHandler![2];

    // Send DELETE-event uten id-felt
    act(() => {
      handler({ old: {} });
    });

    // Stemmen skal fortsatt være i state
    expect(result.current.votes).toHaveLength(1);
  });

  it('nullstiller deletedParticipantIds ved ny runde', async () => {
    const initialVote = makeVote({ id: 'vote-001', participant_id: 'participant-001' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: [initialVote], error: null });
      return Promise.resolve();
    });

    const { result, rerender } = renderHook(
      ({ round }: { round: number }) => useRealtimeVotes(SESSION_ID, round),
      { initialProps: { round: 1 } },
    );

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.votes).toHaveLength(1);
    });

    // Simuler DELETE (deltaker re-estimerer)
    const onCalls = channelMock.on.mock.calls as Array<[string, unknown, (payload: { old: { id: string; participant_id?: string } }) => void]>;
    const deleteHandler = onCalls.find(([_e, config]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config as any)?.event === 'DELETE'
    );
    const handler = deleteHandler![2];

    act(() => {
      handler({ old: { id: 'vote-001', participant_id: 'participant-001' } });
    });

    expect(result.current.deletedParticipantIds.has('participant-001')).toBe(true);

    // Ny runde → reset
    rerender({ round: 2 });

    await waitFor(() => {
      expect(result.current.deletedParticipantIds.size).toBe(0);
    });
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
});

export {};
