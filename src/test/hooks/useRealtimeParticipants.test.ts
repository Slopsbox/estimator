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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelMock: Record<string, any> = {
    on: vi.fn().mockImplementation((_eventType: string, config: { event: string }, handler: (payload: unknown) => void) => {
      if (config.event === 'INSERT') insertHandler = handler as (payload: { new: Participant }) => void;
      if (config.event === 'UPDATE') updateHandler = handler as (payload: { new: Participant }) => void;
      return channelMock;
    }),
    subscribe: vi.fn().mockImplementation((cb?: (status: string) => void) => {
      subscribeCb = cb;
      return channelMock;
    }),
    _triggerSubscribed: () => subscribeCb?.('SUBSCRIBED'),
    _triggerInsert: (p: Participant) => insertHandler?.({ new: p }),
    _triggerUpdate: (p: Participant) => updateHandler?.({ new: p }),
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

import { useRealtimeParticipants } from '../../hooks/useRealtimeParticipants';

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

  // Gjenopprett on-handler tracking
  let subscribeCb: ((status: string) => void) | undefined;
  let insertHandler: ((payload: { new: Participant }) => void) | undefined;
  let updateHandler: ((payload: { new: Participant }) => void) | undefined;

  channelMock.on.mockImplementation(
    (_eventType: string, config: { event: string }, handler: (payload: unknown) => void) => {
      if (config.event === 'INSERT') insertHandler = handler as (payload: { new: Participant }) => void;
      if (config.event === 'UPDATE') updateHandler = handler as (payload: { new: Participant }) => void;
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

  it('henter initial deltakerliste etter subscription bekreftes', async () => {
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

    act(() => {
      channelMock._triggerSubscribed();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.participants).toHaveLength(2);
    expect(result.current.participants[0].id).toBe('participant-001');
    expect(result.current.participants[1].id).toBe('participant-002');
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
