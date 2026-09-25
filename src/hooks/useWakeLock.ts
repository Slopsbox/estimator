import { useCallback, useEffect, useRef } from 'react';

/**
 * Holder skjermen våken mens hooken er montert.
 * Bruker Screen Wake Lock API (støttes av de fleste moderne browsere).
 * Håndterer re-acquire ved tab-bytte (visibilitychange).
 */
export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const requestRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(false);

  const requestWakeLock = useCallback(() => {
    if (!('wakeLock' in navigator) || !navigator.wakeLock || wakeLockRef.current || requestRef.current) return;

    const request = (async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (!mountedRef.current) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener('release', () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        });
      } catch {
        // Wake Lock er best-effort og kan avvises av nettleseren.
      }
    })().finally(() => {
      if (requestRef.current === request) requestRef.current = null;
    });
    requestRef.current = request;
  }, []);

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (sentinel) {
      try {
        void sentinel.release().catch(() => undefined);
      } catch {
        // Ignorer feil ved release.
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Request wake lock ved mount
    requestWakeLock();

    // Re-acquire ved tab-bytte (wake lock frigis automatisk når tab er skjult)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Release ved unmount
    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);
}
