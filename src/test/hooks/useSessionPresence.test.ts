import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type StatusCallback = (status: string) => void;
type PresenceCallback = () => void;

const { channels, channelMock, removeChannelMock } = vi.hoisted(() => {
  const channels: Array<{
    handlers: Record<string, PresenceCallback>;
    state: Record<string, Array<Record<string, unknown>>>;
    status?: StatusCallback;
    track: ReturnType<typeof vi.fn>;
    untrack: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    presenceState: () => Record<string, Array<Record<string, unknown>>>;
  }> = [];
  const channelMock = vi.fn(() => {
    const channel = {
      handlers: {} as Record<string, PresenceCallback>,
      state: {} as Record<string, Array<Record<string, unknown>>>,
      status: undefined as StatusCallback | undefined,
      track: vi.fn().mockResolvedValue('ok'),
      untrack: vi.fn().mockResolvedValue('ok'),
      on: vi.fn(),
      subscribe: vi.fn(),
      presenceState: () => channel.state,
    };
    channel.on.mockImplementation((_type: string, config: { event: string }, callback: PresenceCallback) => {
      channel.handlers[config.event] = callback;
      return channel;
    });
    channel.subscribe.mockImplementation((callback: StatusCallback) => {
      channel.status = callback;
      return channel;
    });
    channels.push(channel);
    return channel;
  });
  return { channels, channelMock, removeChannelMock: vi.fn() };
});

vi.mock('../../lib/supabase', () => ({
  supabase: { channel: channelMock, removeChannel: removeChannelMock },
}));

import { useSessionPresence } from '../../hooks/useSessionPresence';

describe('useSessionPresence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channels.length = 0;
  });

  it('oppretter privat presence-kanal og tracker først etter SUBSCRIBED', async () => {
    renderHook(() => useSessionPresence('session-1', 'participant-1'));
    const channel = channels[0];

    expect(channelMock).toHaveBeenCalledWith('session:session-1:presence', {
      config: { private: true, presence: { key: 'participant-1' } },
    });
    expect(channel.track).not.toHaveBeenCalled();

    await act(async () => channel.status?.('SUBSCRIBED'));

    expect(channel.track).toHaveBeenCalledWith({
      participantId: 'participant-1',
      online_at: expect.any(String),
    });
  });

  it('synkroniserer join og leave fra presenceState og dedupliserer flere metas', async () => {
    const { result } = renderHook(() => useSessionPresence('session-1', 'participant-1'));
    const channel = channels[0];
    await act(async () => channel.status?.('SUBSCRIBED'));
    channel.state = {
      'participant-1': [{ participantId: 'participant-1' }, { participantId: 'participant-1' }],
      'participant-2': [{ participantId: 'participant-2' }],
    };

    act(() => channel.handlers.sync());
    expect([...result.current.presentParticipantIds]).toEqual(['participant-1', 'participant-2']);
    expect(result.current.presenceReady).toBe(true);

    channel.state = { 'participant-2': [{ participantId: 'participant-2' }] };
    act(() => channel.handlers.leave());
    expect([...result.current.presentParticipantIds]).toEqual(['participant-2']);

    channel.state['participant-3'] = [{ participantId: 'participant-3' }];
    act(() => channel.handlers.join());
    expect([...result.current.presentParticipantIds]).toEqual(['participant-2', 'participant-3']);
  });

  it('bruker bare presence key og ignorerer spoofet participantId i payload', () => {
    const { result } = renderHook(() => useSessionPresence('session-1', 'participant-1'));
    const channel = channels[0];
    channel.state = { 'participant-2': [{ participantId: 'spoofed-participant' }] };

    act(() => channel.handlers.sync());

    expect([...result.current.presentParticipantIds]).toEqual(['participant-2']);
  });

  it('blir ikke connected/ready når track feiler og forsøker igjen', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSessionPresence('session-1', 'participant-1'));
      channels[0].track.mockRejectedValueOnce(new Error('track failed'));

      await act(async () => channels[0].status?.('SUBSCRIBED'));
      expect(result.current.connectionState).toBe('disconnected');
      expect(result.current.presenceReady).toBe(false);

      act(() => vi.advanceTimersByTime(2000));
      await act(async () => channels[1].status?.('SUBSCRIBED'));
      expect(result.current.connectionState).toBe('connected');
      expect(result.current.presenceReady).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconnecter og tracker på nytt uten å tømme sist kjente presence', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSessionPresence('session-1', 'participant-1'));
      const first = channels[0];
      first.state = { 'participant-2': [{ participantId: 'participant-2' }] };
      act(() => first.handlers.sync());

      await act(async () => first.status?.('CHANNEL_ERROR'));
      expect(result.current.connectionState).toBe('disconnected');
      expect(result.current.presentParticipantIds.has('participant-2')).toBe(true);
      act(() => vi.advanceTimersByTime(2000));

      const second = channels[1];
      await act(async () => second.status?.('SUBSCRIBED'));
      expect(second.track).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('untracker og fjerner kanalen ved unmount', () => {
    const { unmount } = renderHook(() => useSessionPresence('session-1', 'participant-1'));
    const channel = channels[0];
    unmount();

    expect(channel.untrack).toHaveBeenCalledTimes(1);
    expect(removeChannelMock).toHaveBeenCalledWith(channel);
  });

  it('ignorerer callbacks fra forrige sesjon etter scope-bytte', () => {
    const { result, rerender } = renderHook(
      ({ sessionId }) => useSessionPresence(sessionId, 'participant-1'),
      { initialProps: { sessionId: 'session-1' } },
    );
    const stale = channels[0];
    rerender({ sessionId: 'session-2' });
    stale.state = { ghost: [{ participantId: 'ghost' }] };

    act(() => stale.handlers.sync());

    expect(result.current.presentParticipantIds.has('ghost')).toBe(false);
  });
});
