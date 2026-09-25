import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Vote } from '../lib/types';
import { useSupabaseRealtimeCollection } from './useSupabaseRealtimeCollection';

function isVote(value: unknown): value is Vote {
  if (typeof value !== 'object' || value === null) return false;
  const vote = value as Record<string, unknown>;
  return typeof vote.id === 'string'
    && typeof vote.session_id === 'string'
    && typeof vote.participant_id === 'string'
    && typeof vote.round === 'number'
    && typeof vote.size === 'string'
    && typeof vote.value === 'string'
    && typeof vote.created_at === 'string';
}

/** Abonnerer på stemmer for en sesjon og runde i sanntid. */
export function useRealtimeVotes(
  sessionId: string | null,
  currentRound: number,
  initialRevealed = false,
  participantId?: string,
) {
  const [revealed, setRevealed] = useState(initialRevealed);
  const [readyRevealScope, setReadyRevealScope] = useState<string | null>(null);
  const revealStartedAtRevisionRef = useRef<{
    scope: string;
    requestRevision: number;
  } | null>(null);
  const revealScope = sessionId && initialRevealed ? `${sessionId}:${currentRound}` : null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRevealed(initialRevealed);
  }, [initialRevealed, currentRound]);

  const fetchCollection = useCallback(async () => {
    return supabase
      .from('votes')
      .select('id, session_id, participant_id, round, size, value, created_at')
      .eq('session_id', sessionId ?? '')
      .eq('round', currentRound)
      .order('created_at', { ascending: true });
  }, [sessionId, currentRound]);

  const configureSubscription = useCallback((
    channel: RealtimeChannel,
    setVotes: React.Dispatch<React.SetStateAction<Vote[]>>,
    isCurrent: () => boolean,
  ) => {
    return channel.on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'votes', filter: `session_id=eq.${sessionId}`,
       }, (payload) => {
         if (!isCurrent()) return;
          const vote: unknown = payload.new;
          if (!isVote(vote)) return;
        if (vote.round !== currentRound) return;
        setVotes((current) => current.some((item) => item.id === vote.id) ? current : [...current, vote]);
      });
  }, [sessionId, currentRound]);

  const {
    items: votes,
    loading,
    error,
    connectionState,
    successfulFetchRequestRevision,
    getFetchRequestRevision,
    refetch,
  } = useSupabaseRealtimeCollection({
    sessionId,
    channelName: `votes:${sessionId}:${currentRound}`,
    channelTopic: sessionId ? `session:${sessionId}:votes:${currentRound}` : undefined,
    fetchCollection,
    configureSubscription,
  });
  useEffect(() => {
    if (!revealScope) {
      revealStartedAtRevisionRef.current = null;
      return;
    }
    revealStartedAtRevisionRef.current = {
      scope: revealScope,
      requestRevision: getFetchRequestRevision(),
    };
    let active = true;
    void Promise.resolve(refetch()).then((succeeded) => {
      if (!active) return;
      if (succeeded) {
        revealStartedAtRevisionRef.current = null;
        setReadyRevealScope(revealScope);
      }
    });
    return () => { active = false; };
  }, [getFetchRequestRevision, refetch, revealScope]);

  useEffect(() => {
    const revealStartedAtRevision = revealStartedAtRevisionRef.current;
    if (!revealScope || revealStartedAtRevision?.scope !== revealScope
      || successfulFetchRequestRevision <= revealStartedAtRevision.requestRevision) return;
    revealStartedAtRevisionRef.current = null;
    setReadyRevealScope(revealScope);
  }, [revealScope, successfulFetchRequestRevision]);

  const ownVote = participantId
    ? votes.find((vote) => vote.participant_id === participantId) ?? null
    : null;

  const resultsReady = revealed && readyRevealScope === revealScope && !loading && error === null;

  return { votes, ownVote, loading, error, connectionState, refetch, revealed, resultsReady, setRevealed };
}
