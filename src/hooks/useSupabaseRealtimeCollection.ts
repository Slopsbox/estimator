import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useVisibilityRefetch } from './useVisibilityRefetch';

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
  const refetchInFlightRef = useRef<{ scope: string; promise: Promise<void> } | null>(null);
  const refetchRequestedRef = useRef(false);
  const eventRevisionRef = useRef(0);
  const scopeRef = useRef<string | null>(null);

  const refetch = useCallback(function refetchCollection(): Promise<void> | undefined {
    if (!sessionId) return;
    const requestScope = `${sessionId}:${channelName}`;
    if (refetchInFlightRef.current?.scope === requestScope) {
      refetchRequestedRef.current = true;
      return refetchInFlightRef.current.promise;
    }
    refetchRequestedRef.current = false;
    const generation = generationRef.current;
    const eventRevision = eventRevisionRef.current;
    const attempt = (async () => {
      const result = await fetchCollection();
      if (generation !== generationRef.current) return;
      if (result.error) {
        setError('Kunne ikke oppdatere data. Prøv igjen.');
        if (!fetchRetryTimerRef.current) {
          fetchRetryTimerRef.current = setTimeout(() => {
            fetchRetryTimerRef.current = undefined;
            void refetchCollection();
          }, 2000);
        }
        return;
      }
      if (eventRevision !== eventRevisionRef.current) {
        refetchRequestedRef.current = true;
        return;
      }
      if (result.data) setItems(result.data);
      setError(null);
      setLoading(false);
      if (fetchRetryTimerRef.current) {
        clearTimeout(fetchRetryTimerRef.current);
        fetchRetryTimerRef.current = undefined;
      }
    })().finally(() => {
      if (refetchInFlightRef.current?.promise === attempt) refetchInFlightRef.current = null;
      if (refetchRequestedRef.current && generation === generationRef.current) {
        refetchRequestedRef.current = false;
        queueMicrotask(() => { void refetchCollection(); });
      }
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
    const isCurrent = () => active && generationRef.current === generation;
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
          setConnectionState('connected');
          void refetch();
        }
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && isCurrent()) {
          setConnectionState('disconnected');
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            if (!isCurrent()) return;
            void supabase.removeChannel(channel);
            setRetryCount((count) => count + 1);
          }, 2000);
        }
      });
    void refetch();

    return () => {
      active = false;
      if (generationRef.current === generation) generationRef.current += 1;
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

  useVisibilityRefetch(refetch);

  return { items, setItems, loading, error, connectionState, refetch };
}
