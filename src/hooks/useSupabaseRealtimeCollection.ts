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

/**
 * Felles livssyklus for session-scopede Supabase Realtime-samlinger.
 * Initialdata hentes først når kanalen er SUBSCRIBED for å unngå tapte events.
 */
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
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generationRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!sessionId) return;
    const generation = generationRef.current;
    const result = await fetchCollection();
    if (generation !== generationRef.current) return;
    if (result.error) {
      setError('Kunne ikke oppdatere data. Prøv igjen.');
      return;
    }
    if (result.data) setItems(result.data);
  }, [sessionId, fetchCollection]);

  useEffect(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    if (!sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([]);
      setLoading(false);
      return;
    }

    let active = true;
    const isCurrent = () => active && generationRef.current === generation;
    const setItemsForCurrentGeneration: React.Dispatch<React.SetStateAction<T[]>> = (action) => {
      setItems((current) => {
        if (!isCurrent()) return current;
        return typeof action === 'function' ? action(current) : action;
      });
    };
    setLoading(true);
    setError(null);
    setItems([]);

    const fetchInitialData = async () => {
      const result = await fetchCollection();
      if (!isCurrent()) return;
      if (result.error) {
        setError('Kunne ikke hente data. Prøv igjen.');
      } else if (result.data) {
        setItemsForCurrentGeneration(result.data);
      }
      setLoading(false);
    };

    const channel = configureSubscription(
      supabase.channel(`${channelName}:${retryCount}`),
      setItemsForCurrentGeneration,
      isCurrent,
    )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && isCurrent()) void fetchInitialData();
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && isCurrent()) {
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            if (!isCurrent()) return;
            void supabase.removeChannel(channel);
            setRetryCount((count) => count + 1);
          }, 2000);
        }
      });

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

  return { items, setItems, loading, error };
}
