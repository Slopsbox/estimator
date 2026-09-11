import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('../../lib/supabase', () => ({
  rpcWithAuthRecovery: rpcMock,
}));

import { useRoundVoteStatuses } from '../../hooks/useRoundVoteStatuses';

describe('useRoundVoteStatuses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignorerer sent svar fra gammel runde etter scope-bytte', async () => {
    let resolveOld!: (value: { data: Array<{ participant_id: string; has_voted: boolean }>; error: null }) => void;
    rpcMock
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ data: [{ participant_id: 'new-round', has_voted: true }], error: null });
    const { result, rerender } = renderHook(
      ({ round }) => useRoundVoteStatuses('session-1', round, true),
      { initialProps: { round: 1 } },
    );
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    rerender({ round: 2 });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.statuses).toEqual([{ participant_id: 'new-round', has_voted: true }]));
    await act(async () => resolveOld({ data: [{ participant_id: 'old-round', has_voted: true }], error: null }));

    expect(result.current.statuses).toEqual([{ participant_id: 'new-round', has_voted: true }]);
  });

  it('dedupliserer samtidige kall og nullstiller error ved neste suksess', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'network' } });
    const { result } = renderHook(() => useRoundVoteStatuses('session-1', 1, true));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    let resolveCurrent!: (value: { data: Array<{ participant_id: string; has_voted: boolean }>; error: null }) => void;
    rpcMock
      .mockReturnValueOnce(new Promise((resolve) => { resolveCurrent = resolve; }));
    let firstRequest!: Promise<void>;
    let duplicateRequest!: Promise<void>;
    act(() => {
      firstRequest = result.current.refetch();
      duplicateRequest = result.current.refetch();
    });
    expect(rpcMock).toHaveBeenCalledTimes(2);
    await act(async () => resolveCurrent({ data: [{ participant_id: 'latest', has_voted: true }], error: null }));
    await Promise.all([firstRequest, duplicateRequest]);

    expect(result.current.statuses).toEqual([{ participant_id: 'latest', has_voted: true }]);
    expect(result.current.error).toBeNull();
  });

  it('starter ikke en ny poll mens forrige request fortsatt pågår', async () => {
    vi.useFakeTimers();
    try {
      let resolveRequest!: (value: { data: Array<{ participant_id: string; has_voted: boolean }>; error: null }) => void;
      rpcMock.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
      const { result } = renderHook(() => useRoundVoteStatuses('session-1', 1, true));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
      expect(rpcMock).toHaveBeenCalledTimes(1);

      await act(async () => resolveRequest({ data: [{ participant_id: 'p1', has_voted: true }], error: null }));
      expect(result.current.loading).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
