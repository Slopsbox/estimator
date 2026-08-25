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
  fetchCollection,
  configureSubscription,
}: UseSupabaseRealtimeCollectionOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [connectionState, setConnectionState] = useState<RealtimeCollectionConnectionState>('idle');
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generationRef = useRef(0);
  const refetchInFlightRef = useRef<Promise<void> | null>(null);
  const scopeRef = useRef<string | null>(null);

  const refetch = useCallback(() => {
    if (!sessionId) return;
    if (refetchInFlightRef.current) return refetchInFlightRef.current;
    const generation = generationRef.current;
    const attempt = (async () => {
      const result = await fetchCollection();
      if (generation !== generationRef.current) return;
      if (result.error) {
        setError('Kunne ikke oppdatere data. Prøv igjen.');
        return;
      }
      if (result.data) setItems(result.data);
      setError(null);
    })().finally(() => {
      if (refetchInFlightRef.current === attempt) refetchInFlightRef.current = null;
    });
    refetchInFlightRef.current = attempt;
    return attempt;
  }, [sessionId, fetchCollection]);

  useEffect(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    if (!sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([]);
      setLoading(false);
      setConnectionState('idle');
      scopeRef.current = null;
      return;
    }

    let active = true;
    let initialFetchPending = true;
    const pendingUpdaters: Array<(items: T[]) => T[]> = [];
    const isCurrent = () => active && generationRef.current === generation;
    const setItemsForCurrentGeneration: React.Dispatch<React.SetStateAction<T[]>> = (action) => {
      const updater = typeof action === 'function'
        ? action as (items: T[]) => T[]
        : () => action;
      if (initialFetchPending) pendingUpdaters.push(updater);
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

    const fetchInitialData = async () => {
      const result = await fetchCollection();
      if (!isCurrent()) return;
      if (result.error) {
        setError('Kunne ikke hente data. Prøv igjen.');
      } else if (result.data) {
        setItems(pendingUpdaters.reduce((current, update) => update(current), result.data));
      }
      initialFetchPending = false;
      pendingUpdaters.length = 0;
      setLoading(false);
    };

    const channel = configureSubscription(
      supabase.channel(`${channelName}:${retryCount}`, { config: { private: true } }),
      setItemsForCurrentGeneration,
      isCurrent,
    )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && isCurrent()) {
          setConnectionState('connected');
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
    void fetchInitialData();

    return () => {
      active = false;
      if (generationRef.current === generation) generationRef.current += 1;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = undefined;
      }
      void supabase.removeChannel(channel);
    };
  }, [sessionId, channelName, fetchCollection, configureSubscription, retryCount]);

  useVisibilityRefetch(refetch);

  return { items, setItems, loading, error, connectionState, refetch };
}
