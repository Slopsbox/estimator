import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Participant } from '../lib/types';
import { useVisibilityRefetch } from './useVisibilityRefetch';

/**
 * Abonnerer på deltakerlisten for en sesjon i sanntid.
 * Henter eksisterende deltakere ved mount og lytter på INSERT- og UPDATE-events
 * (UPDATE trengs for å fange navneendringer ved join).
 *
 * Robusthet:
 * - Re-fetcher ved tab-bytte / nettverksgjenoppretting (useVisibilityRefetch)
 * - Re-subscribe automatisk ved CHANNEL_ERROR / TIMED_OUT (retryCount)
 */
export function useRealtimeParticipants(sessionId: string | null) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  // retryCount inkrementeres ved channel-feil og trigger ny subscription via useEffect
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    setLoading(true);

    // Hjelper: hent eksisterende deltakere
    const fetchInitialData = () => {
      void supabase
        .from('participants')
        .select('*')
        .eq('session_id', sessionId)
        .order('joined_at', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) {
            setParticipants(data);
          }
          setLoading(false);
        });
    };

    // Subscribe først – hent initial data ETTER subscription er bekreftet
    const channel = supabase
      .channel(`participants:${sessionId}:${retryCount}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'participants',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setParticipants((prev) => {
            const newParticipant = payload.new as Participant;
            // Unngå duplikater (kan skje ved race conditions)
            if (prev.some((p) => p.id === newParticipant.id)) return prev;
            return [...prev, newParticipant];
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'participants',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const updated = payload.new as Participant;
          setParticipants((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p)),
          );
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
  }, [sessionId, retryCount]);

  // Re-fetch deltakere ved tab-bytte / nettverksgjenoppretting
  const refetchParticipants = useCallback(() => {
    if (!sessionId) return;
    void supabase
      .from('participants')
      .select('*')
      .eq('session_id', sessionId)
      .order('joined_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setParticipants(data);
        }
      });
  }, [sessionId]);

  useVisibilityRefetch(refetchParticipants);

  return { participants, loading };
}
