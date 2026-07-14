import { useCallback, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Vote } from '../lib/types';
import { useSupabaseRealtimeCollection } from './useSupabaseRealtimeCollection';

/** Abonnerer på stemmer for en sesjon og runde i sanntid. */
export function useRealtimeVotes(sessionId: string | null, currentRound: number, initialRevealed = false) {
  const [revealed, setRevealed] = useState(initialRevealed);
  const [deletedParticipantIds, setDeletedParticipantIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRevealed(initialRevealed);
  }, [initialRevealed, currentRound]);

  const fetchCollection = useCallback(async () => {
    return supabase
      .from('votes')
      .select('*')
      .eq('session_id', sessionId ?? '')
      .eq('round', currentRound)
      .order('created_at', { ascending: true });
  }, [sessionId, currentRound]);

  const configureSubscription = useCallback((
    channel: RealtimeChannel,
    setVotes: React.Dispatch<React.SetStateAction<Vote[]>>,
    isCurrent: () => boolean,
  ) => {
    return channel
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'votes', filter: `session_id=eq.${sessionId}`,
       }, (payload) => {
         if (!isCurrent()) return;
         const vote = payload.new as Vote;
        if (vote.round !== currentRound) return;
        setVotes((current) => current.some((item) => item.id === vote.id) ? current : [...current, vote]);
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'votes', filter: `session_id=eq.${sessionId}`,
       }, (payload) => {
         if (!isCurrent()) return;
         const deleted = payload.old as { id?: string; participant_id?: string };
        if (!deleted.id) return;
        setVotes((current) => current.filter((item) => item.id !== deleted.id));
        if (deleted.participant_id) {
          setDeletedParticipantIds((current) => new Set([...current, deleted.participant_id!]));
        }
      });
  }, [sessionId, currentRound]);

  const { items: votes, loading, error } = useSupabaseRealtimeCollection({
    sessionId,
    channelName: `votes:${sessionId}:${currentRound}`,
    fetchCollection,
    configureSubscription,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeletedParticipantIds(new Set());
  }, [sessionId, currentRound]);

  return { votes, loading, error, revealed, setRevealed, deletedParticipantIds };
}
