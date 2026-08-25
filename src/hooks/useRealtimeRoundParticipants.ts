import { useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { RoundParticipant } from '../lib/types';
import { useSupabaseRealtimeCollection } from './useSupabaseRealtimeCollection';

function isRoundParticipant(value: unknown): value is RoundParticipant {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.session_id === 'string'
    && typeof row.round === 'number'
    && typeof row.participant_id === 'string'
    && typeof row.joined_at === 'string'
    && typeof row.reestimate_used === 'boolean';
}

export function useRealtimeRoundParticipants(sessionId: string | null, round: number) {
  const fetchCollection = useCallback(async () => {
    const result = await supabase
      .from('round_participants')
      .select('session_id, round, participant_id, joined_at, reestimate_used')
      .eq('session_id', sessionId ?? '')
      .eq('round', round)
      .order('joined_at', { ascending: true });

    return {
      ...result,
      data: result.data?.filter(
        (row) => isRoundParticipant(row) && row.session_id === sessionId && row.round === round,
      ) ?? null,
    };
  }, [round, sessionId]);

  const configureSubscription = useCallback((
    channel: RealtimeChannel,
    setRows: React.Dispatch<React.SetStateAction<RoundParticipant[]>>,
    isCurrent: () => boolean,
  ) => {
    const belongsToScope = (row: RoundParticipant) => row.session_id === sessionId && row.round === round;
    const upsert = (value: unknown) => {
      if (!isCurrent() || !isRoundParticipant(value) || !belongsToScope(value)) return;
      setRows((current) => {
        const existing = current.findIndex((row) => row.participant_id === value.participant_id);
        if (existing < 0) return [...current, value];
        return current.map((row, index) => index === existing ? value : row);
      });
    };
    const remove = (value: unknown) => {
      if (!isCurrent() || !isRoundParticipant(value) || !belongsToScope(value)) return;
      setRows((current) => current.filter((row) => row.participant_id !== value.participant_id));
    };
    return channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'round_participants', filter: `session_id=eq.${sessionId}` }, (payload) => upsert(payload.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'round_participants', filter: `session_id=eq.${sessionId}` }, (payload) => upsert(payload.new))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'round_participants', filter: `session_id=eq.${sessionId}` }, (payload) => remove(payload.old));
  }, [round, sessionId]);

  const { items: roundParticipants, loading, error, connectionState, refetch } = useSupabaseRealtimeCollection({
    sessionId,
    channelName: `round-participants:${sessionId}:${round}`,
    fetchCollection,
    configureSubscription,
  });

  return { roundParticipants, loading, error, connectionState, refetch };
}
