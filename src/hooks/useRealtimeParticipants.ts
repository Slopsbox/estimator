import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Participant } from '../lib/types';

/**
 * Abonnerer på deltakerlisten for en sesjon i sanntid.
 * Henter eksisterende deltakere ved mount og lytter på INSERT- og UPDATE-events
 * (UPDATE trengs for å fange navneendringer ved join).
 */
export function useRealtimeParticipants(sessionId: string | null) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

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
      .channel(`participants:${sessionId}`)
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
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return { participants, loading };
}
