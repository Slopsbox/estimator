import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const FETCH_TIMEOUT_MS = 10_000;

interface FetchResult<T> {
  data: T[] | null;
  error: unknown;
}

interface UseSupabaseRealtimeCollectionOptions<T> {
  sessionId: string | null;
  channelName: string;
  channelTopic?: string;
  fetchCollection: () => Promise<FetchResult<T>>;
  configureSubscription: (
    channel: RealtimeChannel,
    setItems: React.Dispatch<React.SetStateAction<T[]>>,
    isCurrent: () => boolean,
  ) => RealtimeChannel;
}

export type RealtimeCollectionConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

/** Felles livssyklus for session-scopede Supabase Realtime-samlinger. */
export function useSupabaseRealtimeCollection<T>({
  sessionId,
  channelName,
  channelTopic,
  fetchCollection,
  configureSubscription,
}: UseSupabaseRealtimeCollectionOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [connectionState, setConnectionState] = useState<RealtimeCollectionConnectionState>('idle');
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fetchRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generationRef = useRef(0);
  const refetchInFlightRef = useRef<{ scope: string; promise: Promise<boolean> } | null>(null);
  const refetchRequestedRef = useRef(false);
  const eventRevisionRef = useRef(0);
  const scopeRef = useRef<string | null>(null);
  const fetchSequenceRef = useRef(0);

  const refetch = useCallback(function refetchCollection(): Promise<boolean> | undefined {
    if (!sessionId) return;
    if (navigator.onLine === false || document.visibilityState === 'hidden') {
      return Promise.resolve(false);
    }
    const requestScope = `${sessionId}:${channelName}`;
    if (refetchInFlightRef.current?.scope === requestScope) {
      refetchRequestedRef.current = true;
      return refetchInFlightRef.current.promise;
    }
    const generation = generationRef.current;
    const fetchSequence = ++fetchSequenceRef.current;
    const attempt: Promise<boolean> = (async () => {
      do {
        refetchRequestedRef.current = false;
        const eventRevision = eventRevisionRef.current;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const result = await Promise.race([
          fetchCollection()
            .then((value) => ({ value, failed: false as const }))
            .catch(() => ({ value: null, failed: true as const })),
          new Promise<{ value: null; failed: true }>((resolve) => {
            timeout = setTimeout(() => resolve({ value: null, failed: true }), FETCH_TIMEOUT_MS);
          }),
        ]);
        if (timeout) clearTimeout(timeout);
        if (generation !== generationRef.current || fetchSequence !== fetchSequenceRef.current) return false;
        if (result.failed || result.value.error) {
          setError('Kunne ikke oppdatere data. Prøv igjen.');
          if (refetchRequestedRef.current) continue;
          if (!fetchRetryTimerRef.current && navigator.onLine !== false && document.visibilityState !== 'hidden') {
            fetchRetryTimerRef.current = setTimeout(() => {
              fetchRetryTimerRef.current = undefined;
              void refetchCollection();
            }, 2000);
          }
          return false;
        }
        if (eventRevision !== eventRevisionRef.current) {
          refetchRequestedRef.current = true;
          continue;
        }
        if (result.value.data) setItems(result.value.data);
        setError(null);
        setLoading(false);
        if (fetchRetryTimerRef.current) {
          clearTimeout(fetchRetryTimerRef.current);
          fetchRetryTimerRef.current = undefined;
        }
      } while (refetchRequestedRef.current && generation === generationRef.current);
      return generation === generationRef.current;
    })().finally(() => {
      if (refetchInFlightRef.current?.promise === attempt) refetchInFlightRef.current = null;
    });
    refetchInFlightRef.current = { scope: requestScope, promise: attempt };
    return attempt;
  }, [channelName, sessionId, fetchCollection]);

  useEffect(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    if (!sessionId) {
      setItems([]);
      setLoading(false);
      setConnectionState('idle');
      scopeRef.current = null;
      return;
    }

    let active = true;
    let reconnectPending = false;
    const isCurrent = () => active && generationRef.current === generation;
    const canUseNetwork = () => navigator.onLine !== false && document.visibilityState !== 'hidden';
    const setItemsForCurrentGeneration: React.Dispatch<React.SetStateAction<T[]>> = (action) => {
      const updater = typeof action === 'function'
        ? action as (items: T[]) => T[]
        : () => action;
      eventRevisionRef.current += 1;
      setItems((current) => {
        if (!isCurrent()) return current;
        return updater(current);
      });
    };
    setLoading(true);
    setError(null);
    setConnectionState('connecting');
    const scope = `${sessionId}:${channelName}`;
    if (scopeRef.current !== scope) setItems([]);
    scopeRef.current = scope;

    const channel = configureSubscription(
      supabase.channel(
        channelTopic ? `${channelTopic}:${retryCount}` : `${channelName}:${retryCount}`,
        { config: { private: true } },
      ),
      setItemsForCurrentGeneration,
      isCurrent,
    )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && isCurrent()) {
          reconnectPending = false;
          if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = undefined;
          }
          setConnectionState('connected');
          void refetch();
        }
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && isCurrent()) {
          setConnectionState('disconnected');
          reconnectPending = true;
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          if (!canUseNetwork()) return;
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = undefined;
            if (!isCurrent() || !reconnectPending || !canUseNetwork()) return;
            reconnectPending = false;
            void supabase.removeChannel(channel);
            setRetryCount((count) => count + 1);
          }, 2000);
        }
      });
    void refetch();

    const recover = () => {
      if (!isCurrent() || !canUseNetwork()) return;
      if (refetchInFlightRef.current?.scope === scope) {
        fetchSequenceRef.current += 1;
        refetchInFlightRef.current = null;
      }
      if (reconnectPending) {
        reconnectPending = false;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = undefined;
        }
        void supabase.removeChannel(channel);
        setRetryCount((count) => count + 1);
        return;
      }
      void refetch();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') recover();
    };
    window.addEventListener('online', recover);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      active = false;
      if (generationRef.current === generation) generationRef.current += 1;
      if (refetchInFlightRef.current?.scope === scope) refetchInFlightRef.current = null;
      fetchSequenceRef.current += 1;
      window.removeEventListener('online', recover);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = undefined;
      }
      if (fetchRetryTimerRef.current) {
        clearTimeout(fetchRetryTimerRef.current);
        fetchRetryTimerRef.current = undefined;
      }
      void supabase.removeChannel(channel);
    };
  }, [sessionId, channelName, channelTopic, fetchCollection, configureSubscription, retryCount, refetch]);

  return { items, setItems, loading, error, connectionState, refetch };
}
