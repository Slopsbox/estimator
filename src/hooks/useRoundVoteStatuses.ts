import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { rpcWithAuthRecovery } from '../lib/supabase';

export interface RoundVoteStatus {
  participant_id: string;
  has_voted: boolean;
}

function parseStatuses(value: unknown): RoundVoteStatus[] | null {
  if (!Array.isArray(value)) return null;
  const statuses: RoundVoteStatus[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.participant_id !== 'string' || typeof row.has_voted !== 'boolean') return null;
    statuses.push({ participant_id: row.participant_id, has_voted: row.has_voted });
  }
  return statuses;
}

export function useRoundVoteStatuses(sessionId: string | null, round: number, enabled: boolean) {
  const [statuses, setStatuses] = useState<RoundVoteStatus[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);
  const inFlightRef = useRef<{ scope: string; promise: Promise<void> } | null>(null);
  const scope = sessionId && enabled ? `${sessionId}:${round}` : null;
  const scopeRef = useRef(scope);

  useLayoutEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  const refetch = useCallback(async () => {
    if (!sessionId || !enabled) return;
    const requestScope = `${sessionId}:${round}`;
    if (inFlightRef.current?.scope === requestScope) return inFlightRef.current.promise;
    const requestSequence = ++requestSequenceRef.current;
    const promise = (async () => {
      const result = await rpcWithAuthRecovery('get_round_vote_statuses', { p_session_id: sessionId, p_round: round });
      if (scopeRef.current !== requestScope || requestSequence !== requestSequenceRef.current) return;
      const parsed = result.error ? null : parseStatuses(result.data);
      if (!parsed) {
        setError('Kunne ikke hente stemmestatus. Prøv igjen.');
        setLoading(false);
        return;
      }
      setStatuses(parsed);
      setError(null);
      setLoading(false);
    })().finally(() => {
      if (inFlightRef.current?.promise === promise) inFlightRef.current = null;
    });
    inFlightRef.current = { scope: requestScope, promise };
    return promise;
  }, [enabled, round, sessionId]);

  useEffect(() => {
    if (!enabled || !sessionId) {
      requestSequenceRef.current += 1;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatuses([]);
      setLoading(false);
      setError(null);
      return;
    }
    requestSequenceRef.current += 1;
    setLoading(true);
    void refetch();
    const timer = window.setInterval(() => { void refetch(); }, 2000);
    return () => window.clearInterval(timer);
  }, [enabled, refetch, scope, sessionId]);

  return { statuses, loading, error, refetch };
}
