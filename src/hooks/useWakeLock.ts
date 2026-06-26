import { useCallback, useEffect, useRef } from 'react';

/**
 * Holder skjermen våken mens hooken er montert.
 * Bruker Screen Wake Lock API (støttes av de fleste moderne browsere).
 * Håndterer re-acquire ved tab-bytte (visibilitychange).
 */
export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;

    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null;
      });
    } catch {
      // Wake Lock request feilet (f.eks. lav batteri, browser støtter ikke)
      // Feiler stille – ikke kritisk funksjonalitet
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignorer feil ved release
      }
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Request wake lock ved mount
    void requestWakeLock();

    // Re-acquire ved tab-bytte (wake lock frigis automatisk når tab er skjult)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Release ved unmount
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);
}
