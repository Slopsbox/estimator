import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Vote } from '../lib/types';
import { useVisibilityRefetch } from './useVisibilityRefetch';

/**
 * Abonnerer på stemmer for en sesjon og runde i sanntid.
 * Henter eksisterende stemmer og lytter på nye INSERT-events.
 * Resettes automatisk når currentRound endres.
 * Returnerer også revealed-state fra sessions-tabellen.
 *
 * Robusthet:
 * - Re-fetcher ved tab-bytte / nettverksgjenoppretting (useVisibilityRefetch)
 * - Re-subscribe automatisk ved CHANNEL_ERROR / TIMED_OUT (retryCount)
 */
export function useRealtimeVotes(
  sessionId: string | null,
  currentRound: number,
  initialRevealed = false,
) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(initialRevealed);
  // retryCount inkrementeres ved channel-feil og trigger ny subscription via useEffect
  const [retryCount, setRetryCount] = useState(0);

  // Synkroniser revealed med ekstern endring (f.eks. ved runde-reset)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRevealed(initialRevealed);
  }, [initialRevealed, currentRound]);

  useEffect(() => {
    if (!sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    setLoading(true);
    // Reset stemmer ved ny runde
    setVotes([]);

    // Hjelper: hent eksisterende stemmer for denne runden
    const fetchInitialData = () => {
      void supabase
        .from('votes')
        .select('*')
        .eq('session_id', sessionId)
        .eq('round', currentRound)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) {
            setVotes(data);
          }
          setLoading(false);
        });
    };

    // Subscribe først – hent initial data ETTER subscription er bekreftet
    const channel = supabase
      .channel(`votes:${sessionId}:${currentRound}:${retryCount}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'votes',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const newVote = payload.new as Vote;
          // Filtrer på gjeldende runde
          if (newVote.round !== currentRound) return;
          setVotes((prev) => {
            // Unngå duplikater
            if (prev.some((v) => v.id === newVote.id)) return prev;
            return [...prev, newVote];
          });
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Hent initial data ETTER subscription er oppe – unngår race condition
          fetchInitialData();
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Re-subscribe etter kort delay (trigger ny useEffect via retryCount)
          setTimeout(() => {
            void supabase.removeChannel(channel);
            setRetryCount((c) => c + 1);
          }, 2000);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, currentRound, retryCount]);

  // Re-fetch stemmer ved tab-bytte / nettverksgjenoppretting
  const refetchVotes = useCallback(() => {
    if (!sessionId) return;
    void supabase
      .from('votes')
      .select('*')
      .eq('session_id', sessionId)
      .eq('round', currentRound)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setVotes(data);
        }
      });
  }, [sessionId, currentRound]);

  useVisibilityRefetch(refetchVotes);

  return { votes, loading, revealed, setRevealed };
}
