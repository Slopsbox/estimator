import { useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Participant } from '../lib/types';
import { useSupabaseRealtimeCollection } from './useSupabaseRealtimeCollection';

/** Abonnerer på deltakerlisten for en sesjon i sanntid. */
export function useRealtimeParticipants(sessionId: string | null) {
  const fetchCollection = useCallback(async () => {
    return supabase
      .from('participants')
      .select('*')
      .eq('session_id', sessionId ?? '')
      .order('joined_at', { ascending: true });
  }, [sessionId]);

  const configureSubscription = useCallback((
    channel: RealtimeChannel,
    setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>,
    isCurrent: () => boolean,
  ) => {
    return channel
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}`,
       }, (payload) => {
         if (!isCurrent()) return;
         const participant = payload.new as Participant;
        setParticipants((current) => current.some((item) => item.id === participant.id) ? current : [...current, participant]);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}`,
       }, (payload) => {
         if (!isCurrent()) return;
         const participant = payload.new as Participant;
        setParticipants((current) => current.map((item) => item.id === participant.id ? participant : item));
      });
  }, [sessionId]);

  const { items: participants, loading, error } = useSupabaseRealtimeCollection({
    sessionId,
    channelName: `participants:${sessionId}`,
    fetchCollection,
    configureSubscription,
  });

  return { participants, loading, error };
}
