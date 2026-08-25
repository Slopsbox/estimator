import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: rpcMock },
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

  it('lar bare siste request i samme scope oppdatere state og nullstiller error ved suksess', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'network' } });
    const { result } = renderHook(() => useRoundVoteStatuses('session-1', 1, true));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    let resolveOlder!: (value: { data: Array<{ participant_id: string; has_voted: boolean }>; error: null }) => void;
    rpcMock
      .mockReturnValueOnce(new Promise((resolve) => { resolveOlder = resolve; }))
      .mockResolvedValueOnce({ data: [{ participant_id: 'latest', has_voted: true }], error: null });
    let olderRequest!: Promise<void>;
    let latestRequest!: Promise<void>;
    act(() => {
      olderRequest = result.current.refetch();
      latestRequest = result.current.refetch();
    });
    await act(async () => { await latestRequest; });
    await act(async () => resolveOlder({ data: [{ participant_id: 'older', has_voted: true }], error: null }));
    await olderRequest;

    expect(result.current.statuses).toEqual([{ participant_id: 'latest', has_voted: true }]);
    expect(result.current.error).toBeNull();
  });
});
