import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Participant } from '../../lib/types';

// ============================================================
// vi.hoisted() – variabler tilgjengelige i vi.mock()-factory
// ============================================================

const { chainable, channelMock } = vi.hoisted(() => {
  let subscribeCb: ((status: string) => void) | undefined;
  let insertHandler: ((payload: { new: Participant }) => void) | undefined;
  let updateHandler: ((payload: { new: Participant }) => void) | undefined;
  let deleteHandler: ((payload: { old: Partial<Participant> }) => void) | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelMock: Record<string, any> = {
    on: vi.fn().mockImplementation((_eventType: string, config: { event: string }, handler: (payload: unknown) => void) => {
      if (config.event === 'INSERT') insertHandler = handler as (payload: { new: Participant }) => void;
      if (config.event === 'UPDATE') updateHandler = handler as (payload: { new: Participant }) => void;
      if (config.event === 'DELETE') deleteHandler = handler as (payload: { old: Partial<Participant> }) => void;
      return channelMock;
    }),
    subscribe: vi.fn().mockImplementation((cb?: (status: string) => void) => {
      subscribeCb = cb;
      return channelMock;
    }),
    _triggerSubscribed: () => subscribeCb?.('SUBSCRIBED'),
    _triggerInsert: (p: Participant) => insertHandler?.({ new: p }),
    _triggerUpdate: (p: Participant) => updateHandler?.({ new: p }),
    _triggerDelete: (p: Partial<Participant>) => deleteHandler?.({ old: p }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chainable: Record<string, any> = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
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

  ['from', 'select', 'eq', 'is', 'order'].forEach((m) => chainable[m].mockReturnValue(chainable));

  return { chainable, channelMock };
});

vi.mock('../../lib/supabase', () => ({ supabase: chainable }));

import { useRealtimeParticipants } from '../../hooks/useRealtimeParticipants';

// ============================================================
// Hjelpere
// ============================================================

function resetChainable() {
  vi.clearAllMocks();

  ['from', 'select', 'eq', 'is', 'order'].forEach((m) => chainable[m].mockReturnValue(chainable));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chainable.then.mockImplementation((cb: (r: any) => void) => {
    cb({ data: [], error: null });
    return Promise.resolve();
  });
  chainable.single.mockResolvedValue({ data: null, error: null });

  // Gjenopprett on-handler tracking
  let subscribeCb: ((status: string) => void) | undefined;
  let insertHandler: ((payload: { new: Participant }) => void) | undefined;
  let updateHandler: ((payload: { new: Participant }) => void) | undefined;
  let deleteHandler: ((payload: { old: Partial<Participant> }) => void) | undefined;

  channelMock.on.mockImplementation(
    (_eventType: string, config: { event: string }, handler: (payload: unknown) => void) => {
      if (config.event === 'INSERT') insertHandler = handler as (payload: { new: Participant }) => void;
      if (config.event === 'UPDATE') updateHandler = handler as (payload: { new: Participant }) => void;
      if (config.event === 'DELETE') deleteHandler = handler as (payload: { old: Partial<Participant> }) => void;
      return channelMock;
    },
  );
  channelMock.subscribe.mockImplementation((cb?: (status: string) => void) => {
    subscribeCb = cb;
    return channelMock;
  });
  channelMock._triggerSubscribed = () => subscribeCb?.('SUBSCRIBED');
  channelMock._triggerInsert = (p: Participant) => insertHandler?.({ new: p });
  channelMock._triggerUpdate = (p: Participant) => updateHandler?.({ new: p });
  channelMock._triggerDelete = (p: Partial<Participant>) => deleteHandler?.({ old: p });

  chainable.channel.mockReturnValue(channelMock);
  chainable.removeChannel.mockResolvedValue(undefined);
}

// Faste testdata
const SESSION_ID = 'session-abc';

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: 'participant-001',
    session_id: SESSION_ID,
    name: 'Ola Nordmann',
    role: 'participant',
    joined_at: '2026-01-01T00:00:00Z',
    left_at: null,
    ...overrides,
  };
}

// ============================================================
// Tester
// ============================================================

describe('useRealtimeParticipants', () => {
  beforeEach(() => {
    resetChainable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returnerer tom array og loading=false for null sessionId', async () => {
    const { result } = renderHook(() => useRealtimeParticipants(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.participants).toEqual([]);
  });

  it('henter initial deltakerliste umiddelbart og bruker privat session-topic', async () => {
    const initialParticipants = [
      makeParticipant({ id: 'participant-001', name: 'Ola' }),
      makeParticipant({ id: 'participant-002', name: 'Kari', role: 'facilitator' }),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: initialParticipants, error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeParticipants(SESSION_ID));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.participants).toHaveLength(2);
    expect(result.current.participants[0].id).toBe('participant-001');
    expect(result.current.participants[1].id).toBe('participant-002');
    expect(chainable.channel).toHaveBeenCalledWith(`session:${SESSION_ID}:participants:active:0`, {
      config: { private: true },
    });
  });

  it('reconciler snapshot når subscriptionen blir klar', async () => {
    const initial = makeParticipant({ id: 'participant-001' });
    const joinedDuringGap = makeParticipant({ id: 'participant-002' });
    let call = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      call += 1;
      cb({ data: call === 1 ? [initial] : [initial, joinedDuringGap], error: null });
      return Promise.resolve();
    });
    const { result } = renderHook(() => useRealtimeParticipants(SESSION_ID));
    await waitFor(() => expect(result.current.participants).toHaveLength(1));

    act(() => channelMock._triggerSubscribed());

    await waitFor(() => expect(result.current.participants).toHaveLength(2));
  });

  it('retryer automatisk etter transient initial fetch-feil', async () => {
    vi.useFakeTimers();
    try {
      let call = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chainable.then.mockImplementation((cb: (r: any) => void) => {
        call += 1;
        cb(call === 1
          ? { data: null, error: { code: 'network' } }
          : { data: [makeParticipant()], error: null });
        return Promise.resolve();
      });
      const { result } = renderHook(() => useRealtimeParticipants(SESSION_ID));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.error).not.toBeNull();

      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

      expect(result.current.error).toBeNull();
      expect(result.current.participants).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('replayer INSERT, UPDATE og DELETE som skjer mens initial fetch er in-flight', async () => {
    let resolveFetch!: (result: { data: Participant[]; error: null }) => void;
    chainable.then.mockImplementation((resolve: typeof resolveFetch) => {
      resolveFetch = resolve;
      return Promise.resolve();
    });
    const old = makeParticipant({ name: 'Gammelt navn' });
    const inserted = makeParticipant({ id: 'participant-002', name: 'Ny' });
    const { result } = renderHook(() => useRealtimeParticipants(SESSION_ID));

    await waitFor(() => expect(resolveFetch).toBeTypeOf('function'));

    act(() => {
      channelMock._triggerInsert(inserted);
      channelMock._triggerUpdate({ ...old, name: 'Oppdatert navn' });
      channelMock._triggerDelete(inserted);
    });
    await act(async () => resolveFetch({ data: [old], error: null }));

    expect(result.current.participants).toEqual([{ ...old, name: 'Oppdatert navn' }]);
  });

  it('legger til ny deltaker fra INSERT-event', async () => {
    const initialParticipants = [makeParticipant({ id: 'participant-001' })];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: initialParticipants, error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeParticipants(SESSION_ID));

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Simuler ny deltaker fra realtime INSERT
    const newParticipant = makeParticipant({ id: 'participant-002', name: 'Kari' });
    act(() => {
      channelMock._triggerInsert(newParticipant);
    });

    expect(result.current.participants).toHaveLength(2);
    expect(result.current.participants[1].id).toBe('participant-002');
    expect(result.current.participants[1].name).toBe('Kari');
  });

  it('oppdaterer eksisterende deltaker fra UPDATE-event', async () => {
    const initialParticipants = [
      makeParticipant({ id: 'participant-001', name: 'Ola (gammelt navn)' }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: initialParticipants, error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeParticipants(SESSION_ID));

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Simuler navneendring via realtime UPDATE
    const updatedParticipant = makeParticipant({ id: 'participant-001', name: 'Ola (nytt navn)' });
    act(() => {
      channelMock._triggerUpdate(updatedParticipant);
    });

    expect(result.current.participants).toHaveLength(1);
    expect(result.current.participants[0].name).toBe('Ola (nytt navn)');
  });

  it('henter kun aktive memberships og fjerner left membership ved UPDATE', async () => {
    const participant = makeParticipant();
    chainable.then.mockImplementation((cb: (r: { data: Participant[]; error: null }) => void) => {
      cb({ data: [participant], error: null });
      return Promise.resolve();
    });
    const { result } = renderHook(() => useRealtimeParticipants(SESSION_ID));
    act(() => channelMock._triggerSubscribed());
    await waitFor(() => expect(result.current.participants).toHaveLength(1));
    expect(chainable.is).toHaveBeenCalledWith('left_at', null);

    act(() => channelMock._triggerUpdate({ ...participant, left_at: '2026-01-02T00:00:00Z' }));
    expect(result.current.participants).toEqual([]);
  });

  it('reaktiverer membership ved UPDATE med left_at null', async () => {
    const { result } = renderHook(() => useRealtimeParticipants(SESSION_ID));
    act(() => channelMock._triggerSubscribed());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const participant = makeParticipant();
    act(() => channelMock._triggerUpdate(participant));
    expect(result.current.participants).toEqual([participant]);
  });

  it('unngår duplikater ved INSERT av eksisterende id', async () => {
    const existingParticipant = makeParticipant({ id: 'participant-dup' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: [existingParticipant], error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeParticipants(SESSION_ID));

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Send samme deltaker på nytt (race condition i backend)
    act(() => {
      channelMock._triggerInsert(existingParticipant);
    });

    expect(result.current.participants).toHaveLength(1);
  });

  it('ignorerer event fra forrige sesjon etter sessionId-bytte', async () => {
    const { result, rerender } = renderHook(
      ({ sessionId }: { sessionId: string }) => useRealtimeParticipants(sessionId),
      { initialProps: { sessionId: SESSION_ID } },
    );

    const firstSessionInsertHandler = channelMock.on.mock.calls.find((call: [string, { event?: string }, unknown]) =>
      call[1].event === 'INSERT',
    )?.[2] as ((payload: { new: Participant }) => void) | undefined;

    expect(firstSessionInsertHandler).toBeDefined();

    await act(async () => {
      rerender({ sessionId: 'session-new' });
      await Promise.resolve();
    });

    act(() => {
      firstSessionInsertHandler?.({ new: makeParticipant({ id: 'participant-from-old-session' }) });
    });

    expect(result.current.participants).toEqual([]);
  });

  it('ignorerer refetch-resultat fra forrige sesjon etter sessionId-bytte', async () => {
    const { result, rerender } = renderHook(
      ({ sessionId }: { sessionId: string }) => useRealtimeParticipants(sessionId),
      { initialProps: { sessionId: SESSION_ID } },
    );

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let resolveRefetch!: (result: { data: Participant[]; error: null }) => void;
    const newParticipant = makeParticipant({ id: 'participant-from-new-session', session_id: 'session-new' });
    chainable.then
      .mockImplementationOnce((resolve: (result: { data: Participant[]; error: null }) => void) => {
        resolveRefetch = resolve;
        return Promise.resolve();
      })
      .mockImplementation((resolve: (result: { data: Participant[]; error: null }) => void) => {
        resolve({ data: [newParticipant], error: null });
        return Promise.resolve();
      });

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(resolveRefetch).toBeTypeOf('function');
    });

    rerender({ sessionId: 'session-new' });

    await act(async () => {
      resolveRefetch({ data: [makeParticipant({ id: 'participant-from-old-refetch' })], error: null });
    });

    await waitFor(() => expect(result.current.participants).toEqual([newParticipant]));
  });

  it('cleanup: fjerner channel ved unmount', async () => {
    const { unmount } = renderHook(() => useRealtimeParticipants(SESSION_ID));

    act(() => {
      channelMock._triggerSubscribed();
    });

    unmount();

    expect(chainable.removeChannel).toHaveBeenCalledWith(channelMock);
  });

  it('re-fetcher deltakere ved online-event (visibility refetch)', async () => {
    const initialParticipants = [makeParticipant({ id: 'participant-001' })];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: initialParticipants, error: null });
      return Promise.resolve();
    });

    const { result } = renderHook(() => useRealtimeParticipants(SESSION_ID));

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Oppdater mock til å returnere en ekstra deltaker ved re-fetch
    const updatedParticipants = [
      makeParticipant({ id: 'participant-001' }),
      makeParticipant({ id: 'participant-002', name: 'Kari' }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chainable.then.mockImplementation((cb: (r: any) => void) => {
      cb({ data: updatedParticipants, error: null });
      return Promise.resolve();
    });

    // Simuler online-event → trigger re-fetch
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(result.current.participants).toHaveLength(2);
    });
  });
});

export {};
