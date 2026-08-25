import { useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Participant } from '../lib/types';
import { useSupabaseRealtimeCollection } from './useSupabaseRealtimeCollection';

function isParticipant(value: unknown): value is Participant {
  if (typeof value !== 'object' || value === null) return false;
  const participant = value as Record<string, unknown>;
  return typeof participant.id === 'string'
    && typeof participant.session_id === 'string'
    && typeof participant.name === 'string'
    && typeof participant.role === 'string'
    && typeof participant.joined_at === 'string'
    && (typeof participant.left_at === 'string' || participant.left_at === null);
}

/** Abonnerer på deltakerlisten for en sesjon i sanntid. */
export function useRealtimeParticipants(sessionId: string | null, includeInactive = false) {
  const fetchCollection = useCallback(async () => {
    const query = supabase
      .from('participants')
      .select('id, session_id, name, role, joined_at, left_at')
      .eq('session_id', sessionId ?? '');
    return (includeInactive ? query : query.is('left_at', null))
      .order('joined_at', { ascending: true });
  }, [includeInactive, sessionId]);

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
          const participant: unknown = payload.new;
          if (!isParticipant(participant)) return;
        setParticipants((current) => current.some((item) => item.id === participant.id) ? current : [...current, participant]);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}`,
       }, (payload) => {
         if (!isCurrent()) return;
          const participant: unknown = payload.new;
          if (!isParticipant(participant)) return;
        if (!includeInactive && participant.left_at !== null) {
          setParticipants((current) => current.filter((item) => item.id !== participant.id));
          return;
        }
        setParticipants((current) => current.some((item) => item.id === participant.id)
          ? current.map((item) => item.id === participant.id ? participant : item)
          : [...current, participant]);
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        if (!isCurrent()) return;
        const deleted = payload.old;
        if (typeof deleted !== 'object' || deleted === null || typeof (deleted as Record<string, unknown>).id !== 'string') return;
        setParticipants((current) => current.filter((item) => item.id !== (deleted as Record<string, unknown>).id));
      });
  }, [includeInactive, sessionId]);

  const { items: participants, loading, error, connectionState, refetch } = useSupabaseRealtimeCollection({
    sessionId,
    channelName: `participants:${sessionId}:${includeInactive ? 'all' : 'active'}`,
    fetchCollection,
    configureSubscription,
  });

  return { participants, loading, error, connectionState, refetch };
}
