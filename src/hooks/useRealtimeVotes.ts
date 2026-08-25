import { useCallback, useEffect, useState } from 'react';
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

  const { items: votes, loading, error, connectionState, refetch } = useSupabaseRealtimeCollection({
    sessionId,
    channelName: `votes:${sessionId}:${currentRound}`,
    fetchCollection,
    configureSubscription,
  });

  useEffect(() => {
    if (initialRevealed) void refetch();
  }, [initialRevealed, refetch]);

  const ownVote = participantId
    ? votes.find((vote) => vote.participant_id === participantId) ?? null
    : null;

  return { votes, ownVote, loading, error, connectionState, refetch, revealed, setRevealed };
}
