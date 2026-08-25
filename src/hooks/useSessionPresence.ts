import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { RealtimeCollectionConnectionState } from './useSupabaseRealtimeCollection';

function idsFromState(state: Record<string, unknown[]>): Set<string> {
  const ids = new Set<string>();
  for (const key of Object.keys(state)) {
    if (key) ids.add(key);
  }
  return ids;
}

export function useSessionPresence(sessionId: string | null, participantId: string | null) {
  const [presentParticipantIds, setPresentParticipantIds] = useState<Set<string>>(new Set());
  const [connectionState, setConnectionState] = useState<RealtimeCollectionConnectionState>('idle');
  const [presenceReady, setPresenceReady] = useState(false);
  const generationRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const generation = ++generationRef.current;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);

    if (!sessionId || !participantId) {
      // Scope removal must immediately discard presence from the previous session.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPresentParticipantIds(new Set());
      setConnectionState('idle');
      setPresenceReady(false);
      return;
    }

    let active = true;
    let channel: RealtimeChannel | null = null;
    const isCurrent = () => active && generationRef.current === generation;

    const connect = () => {
      if (!isCurrent()) return;
      setConnectionState('connecting');
      setPresenceReady(false);
      const currentChannel = supabase.channel(`session:${sessionId}:presence`, {
        config: { private: true, presence: { key: participantId } },
      });
      channel = currentChannel;

      const sync = () => {
        if (!isCurrent() || channel !== currentChannel) return;
        setPresentParticipantIds(idsFromState(currentChannel.presenceState()));
      };

      currentChannel
        .on('presence', { event: 'sync' }, sync)
        .on('presence', { event: 'join' }, sync)
        .on('presence', { event: 'leave' }, sync)
        .subscribe(async (status) => {
          if (!isCurrent() || channel !== currentChannel) return;
          if (status === 'SUBSCRIBED') {
            try {
              await currentChannel.track({ participantId, online_at: new Date().toISOString() });
              if (!isCurrent() || channel !== currentChannel) return;
              setConnectionState('connected');
              setPresenceReady(true);
            } catch {
              if (!isCurrent() || channel !== currentChannel) return;
              setConnectionState('disconnected');
              setPresenceReady(false);
              if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
              retryTimerRef.current = setTimeout(() => {
                if (!isCurrent()) return;
                void supabase.removeChannel(currentChannel);
                connect();
              }, 2000);
            }
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConnectionState('disconnected');
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            const staleChannel = currentChannel;
            retryTimerRef.current = setTimeout(() => {
              if (!isCurrent()) return;
              void supabase.removeChannel(staleChannel);
              connect();
            }, 2000);
          }
        });
    };

    connect();
    return () => {
      active = false;
      if (generationRef.current === generation) generationRef.current += 1;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (channel) {
        void channel.untrack();
        void supabase.removeChannel(channel);
      }
    };
  }, [participantId, sessionId]);

  return { presentParticipantIds, connectionState, presenceReady };
}
