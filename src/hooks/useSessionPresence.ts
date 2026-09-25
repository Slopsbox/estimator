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
    const activeSessionId = sessionId;
    const activeParticipantId = participantId;

    let active = true;
    let channel: RealtimeChannel | null = null;
    let reconnectPending = false;
    const isCurrent = () => active && generationRef.current === generation;
    const canUseNetwork = () => navigator.onLine !== false && document.visibilityState !== 'hidden';

    const reconnect = (staleChannel: RealtimeChannel) => {
      if (!isCurrent() || channel !== staleChannel || !reconnectPending || !canUseNetwork()) return;
      reconnectPending = false;
      void supabase.removeChannel(staleChannel);
      connect();
    };

    const scheduleReconnect = (staleChannel: RealtimeChannel) => {
      reconnectPending = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (!canUseNetwork()) return;
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        reconnect(staleChannel);
      }, 2000);
    };

    function connect() {
      if (!isCurrent()) return;
      setConnectionState('connecting');
      setPresenceReady(false);
      const currentChannel = supabase.channel(`session:${activeSessionId}:presence`, {
        config: { private: true, presence: { key: activeParticipantId } },
      });
      channel = currentChannel;
      let trackSucceeded = false;
      let presenceSynced = false;
      let statusRevision = 0;

      const updateReady = () => {
        if (!isCurrent() || channel !== currentChannel) return;
        setPresenceReady(trackSucceeded && presenceSynced);
      };

      const sync = () => {
        if (!isCurrent() || channel !== currentChannel) return;
        presenceSynced = true;
        setPresentParticipantIds(idsFromState(currentChannel.presenceState()));
        updateReady();
      };

      currentChannel
        .on('presence', { event: 'sync' }, sync)
        .on('presence', { event: 'join' }, sync)
        .on('presence', { event: 'leave' }, sync)
        .subscribe(async (status) => {
          if (!isCurrent() || channel !== currentChannel) return;
          if (status === 'SUBSCRIBED') {
            const subscribedRevision = ++statusRevision;
            reconnectPending = false;
            if (retryTimerRef.current) {
              clearTimeout(retryTimerRef.current);
              retryTimerRef.current = null;
            }
            trackSucceeded = false;
            setPresenceReady(false);
            try {
              const result = await currentChannel.track({ participantId: activeParticipantId, online_at: new Date().toISOString() });
              if (!isCurrent() || channel !== currentChannel || statusRevision !== subscribedRevision) return;
              if (result !== 'ok') throw new Error('Presence track failed');
              trackSucceeded = true;
              setConnectionState('connected');
              updateReady();
            } catch {
              if (!isCurrent() || channel !== currentChannel || statusRevision !== subscribedRevision) return;
              trackSucceeded = false;
              setConnectionState('disconnected');
              setPresenceReady(false);
              scheduleReconnect(currentChannel);
            }
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            statusRevision += 1;
            trackSucceeded = false;
            presenceSynced = false;
            setConnectionState('disconnected');
            setPresenceReady(false);
            scheduleReconnect(currentChannel);
          }
        });
    }

    connect();
    const recover = () => {
      if (!isCurrent() || !canUseNetwork()) return;
      if (channel && reconnectPending) reconnect(channel);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') recover();
    };
    window.addEventListener('online', recover);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      if (generationRef.current === generation) generationRef.current += 1;
      window.removeEventListener('online', recover);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (channel) {
        void channel.untrack();
        void supabase.removeChannel(channel);
      }
    };
  }, [participantId, sessionId]);

  return { presentParticipantIds, connectionState, presenceReady };
}
