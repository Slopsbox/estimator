import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type StatusCallback = (status: string) => void;

const { channels, supabaseMock } = vi.hoisted(() => {
  const channels: Array<{ status?: StatusCallback; subscribe: ReturnType<typeof vi.fn> }> = [];
  const supabaseMock = {
    channel: vi.fn(() => {
      const channel = {
        status: undefined as StatusCallback | undefined,
        subscribe: vi.fn((callback: StatusCallback) => {
          channel.status = callback;
          return channel;
        }),
      };
      channels.push(channel);
      return channel;
    }),
    removeChannel: vi.fn(),
  };
  return { channels, supabaseMock };
});

vi.mock('../../lib/supabase', () => ({ supabase: supabaseMock }));

import { useSupabaseRealtimeCollection } from '../../hooks/useSupabaseRealtimeCollection';

const configureSubscription = (channel: Parameters<Parameters<typeof useSupabaseRealtimeCollection>[0]['configureSubscription']>[0]) => channel;

describe('useSupabaseRealtimeCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channels.length = 0;
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('cancels a scheduled reconnect when the current channel recovers', async () => {
    vi.useFakeTimers();
    try {
      const fetchCollection = vi.fn().mockResolvedValue({ data: [], error: null });
      renderHook(() => useSupabaseRealtimeCollection({
        sessionId: 'session-1',
        channelName: 'items',
        fetchCollection,
        configureSubscription,
      }));

      await act(async () => {
        channels[0].status?.('CHANNEL_ERROR');
        channels[0].status?.('SUBSCRIBED');
        await Promise.resolve();
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

      expect(supabaseMock.channel).toHaveBeenCalledTimes(1);
      expect(supabaseMock.removeChannel).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out a hung fetch, runs the queued refetch, and ignores the stale late result', async () => {
    vi.useFakeTimers();
    try {
      let resolveHung!: (value: { data: string[]; error: null }) => void;
      const fetchCollection = vi.fn()
        .mockImplementationOnce(() => new Promise((resolve) => { resolveHung = resolve; }))
        .mockResolvedValueOnce({ data: ['fresh'], error: null });
      const { result } = renderHook(() => useSupabaseRealtimeCollection({
        sessionId: 'session-1',
        channelName: 'items',
        fetchCollection,
        configureSubscription,
      }));
      expect(fetchCollection).toHaveBeenCalledTimes(1);

      let queuedRefetch!: Promise<boolean> | undefined;
      act(() => { queuedRefetch = result.current.refetch(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      await act(async () => { await queuedRefetch; });

      expect(result.current.items).toEqual(['fresh']);
      expect(result.current.loading).toBe(false);

      await act(async () => resolveHung({ data: ['stale'], error: null }));
      expect(result.current.items).toEqual(['fresh']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reconnect while offline and reconnects immediately when online', async () => {
    vi.useFakeTimers();
    try {
      const fetchCollection = vi.fn().mockResolvedValue({ data: [], error: null });
      renderHook(() => useSupabaseRealtimeCollection({
        sessionId: 'session-1',
        channelName: 'items',
        fetchCollection,
        configureSubscription,
      }));

      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      act(() => channels[0].status?.('CHANNEL_ERROR'));
      act(() => vi.advanceTimersByTime(10_000));
      expect(supabaseMock.channel).toHaveBeenCalledTimes(1);

      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      await act(async () => {
        window.dispatchEvent(new Event('online'));
        await Promise.resolve();
      });
      expect(supabaseMock.channel).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reconnect while hidden and reconnects immediately when visible', async () => {
    vi.useFakeTimers();
    try {
      const fetchCollection = vi.fn().mockResolvedValue({ data: [], error: null });
      renderHook(() => useSupabaseRealtimeCollection({
        sessionId: 'session-1',
        channelName: 'items',
        fetchCollection,
        configureSubscription,
      }));

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      act(() => channels[0].status?.('CHANNEL_ERROR'));
      act(() => vi.advanceTimersByTime(10_000));
      expect(supabaseMock.channel).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
      });
      expect(supabaseMock.channel).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
