import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundParticipant } from '../../lib/types';

const { db, channel } = vi.hoisted(() => {
  const handlers = new Map<string, (payload: { new: unknown; old: unknown }) => void>();
  let status: ((value: string) => void) | undefined;
  const channel = {
    on: vi.fn((_type: string, config: { event: string }, callback: (payload: { new: unknown; old: unknown }) => void) => {
      handlers.set(config.event, callback);
      return channel;
    }),
    subscribe: vi.fn((callback: (value: string) => void) => {
      status = callback;
      return channel;
    }),
    triggerStatus: (value: string) => status?.(value),
    trigger: (event: string, value: unknown) => handlers.get(event)?.({ new: value, old: value }),
  };
  const db = {
    result: { data: [] as RoundParticipant[], error: null as unknown },
    from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(),
    then: vi.fn((resolve: (value: { data: RoundParticipant[]; error: unknown }) => void) => Promise.resolve(resolve(db.result))),
    channel: vi.fn(() => channel), removeChannel: vi.fn(),
  };
  for (const method of ['from', 'select', 'eq', 'order'] as const) db[method].mockReturnValue(db);
  return { db, channel };
});

vi.mock('../../lib/supabase', () => ({ supabase: db }));

import { useRealtimeRoundParticipants } from '../../hooks/useRealtimeRoundParticipants';

const row = (overrides: Partial<RoundParticipant> = {}): RoundParticipant => ({
  session_id: 'session-1', round: 1, participant_id: 'participant-1',
  joined_at: '2026-01-01T00:00:00Z', reestimate_used: false, ...overrides,
});

describe('useRealtimeRoundParticipants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.result = { data: [], error: null };
    for (const method of ['from', 'select', 'eq', 'order'] as const) db[method].mockReturnValue(db);
    db.channel.mockReturnValue(channel);
  });

  it('henter initial roster for sesjon og runde', async () => {
    db.result = { data: [row()], error: null };
    const { result } = renderHook(() => useRealtimeRoundParticipants('session-1', 1));
    act(() => channel.triggerStatus('SUBSCRIBED'));

    await waitFor(() => expect(result.current.roundParticipants).toEqual([row()]));
    expect(db.eq).toHaveBeenCalledWith('session_id', 'session-1');
    expect(db.eq).toHaveBeenCalledWith('round', 1);
    expect(db.channel).toHaveBeenCalledWith('session:session-1:round:1:0', { config: { private: true } });
  });

  it('reconciler roster-events som skjer mens initial fetch er in-flight', async () => {
    let resolveFetch!: (value: { data: RoundParticipant[]; error: null }) => void;
    db.then.mockImplementationOnce((resolve: typeof resolveFetch) => {
      resolveFetch = resolve;
      return Promise.resolve();
    });
    const inserted = row({ participant_id: 'participant-2' });
    const { result } = renderHook(() => useRealtimeRoundParticipants('session-1', 1));
    await waitFor(() => expect(resolveFetch).toBeTypeOf('function'));

    act(() => {
      channel.trigger('INSERT', inserted);
      channel.trigger('UPDATE', row({ reestimate_used: true }));
      channel.trigger('DELETE', inserted);
    });
    db.result = { data: [row({ reestimate_used: true })], error: null };
    await act(async () => resolveFetch({ data: [row()], error: null }));

    await waitFor(() => expect(result.current.roundParticipants).toEqual([row({ reestimate_used: true })]));
  });

  it('håndterer gyldige INSERT, UPDATE og DELETE og avviser feil scope', async () => {
    const { result } = renderHook(() => useRealtimeRoundParticipants('session-1', 1));
    act(() => channel.triggerStatus('SUBSCRIBED'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => channel.trigger('INSERT', row()));
    expect(result.current.roundParticipants).toHaveLength(1);
    act(() => channel.trigger('UPDATE', row({ reestimate_used: true })));
    expect(result.current.roundParticipants[0].reestimate_used).toBe(true);
    act(() => channel.trigger('INSERT', row({ session_id: 'other' })));
    expect(result.current.roundParticipants).toHaveLength(1);
    act(() => channel.trigger('DELETE', row()));
    expect(result.current.roundParticipants).toEqual([]);
  });

  it('håndterer DELETE-payload som bare inneholder primærnøkkelen', async () => {
    db.result = { data: [row()], error: null };
    const { result } = renderHook(() => useRealtimeRoundParticipants('session-1', 1));
    await waitFor(() => expect(result.current.roundParticipants).toEqual([row()]));

    act(() => channel.trigger('DELETE', {
      session_id: 'session-1',
      round: 1,
      participant_id: 'participant-1',
    }));

    expect(result.current.roundParticipants).toEqual([]);
  });

  it('tømmer roster ved rundebytte, men bevarer den under reconnect i samme scope', async () => {
    db.result = { data: [row()], error: null };
    const { result, rerender } = renderHook(
      ({ round }) => useRealtimeRoundParticipants('session-1', round),
      { initialProps: { round: 1 } },
    );
    act(() => channel.triggerStatus('SUBSCRIBED'));
    await waitFor(() => expect(result.current.roundParticipants).toHaveLength(1));
    act(() => channel.triggerStatus('CLOSED'));
    expect(result.current.roundParticipants).toHaveLength(1);

    await act(async () => {
      rerender({ round: 2 });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.roundParticipants).toEqual([]));
  });
});
