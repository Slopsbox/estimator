import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Vote } from '../lib/types';

/**
 * Abonnerer på stemmer for en sesjon og runde i sanntid.
 * Henter eksisterende stemmer og lytter på nye INSERT-events.
 * Resettes automatisk når currentRound endres.
 * Returnerer også revealed-state fra sessions-tabellen.
 */
export function useRealtimeVotes(
  sessionId: string | null,
  currentRound: number,
  initialRevealed = false,
) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(initialRevealed);

  // Synkroniser revealed med ekstern endring (f.eks. ved runde-reset)
  useEffect(() => {
    setRevealed(initialRevealed);
  }, [initialRevealed, currentRound]);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Reset stemmer ved ny runde
    setVotes([]);

    // Hent eksisterende stemmer for denne runden
    void supabase
      .from('votes')
      .select('*')
      .eq('session_id', sessionId)
      .eq('round', currentRound)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setVotes(data as Vote[]);
        }
        setLoading(false);
      });

    // Subscribe til nye stemmer for denne sesjonen
    const channel = supabase
      .channel(`votes:${sessionId}:${currentRound}`)
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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, currentRound]);

  return { votes, loading, revealed, setRevealed };
}
