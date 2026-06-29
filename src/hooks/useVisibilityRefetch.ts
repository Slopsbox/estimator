import { useEffect } from 'react';

/**
 * Kaller callback når appen/tab-en blir synlig igjen.
 * Brukes for å re-fetche session-state etter at mobilen våkner,
 * tab-bytte, eller app-switch.
 * Lytter også på online-event (nettverket kommer tilbake).
 */
export function useVisibilityRefetch(callback: () => void) {
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        callback();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    // Også lytt på online-event (nettverket kommer tilbake)
    window.addEventListener('online', callback);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', callback);
    };
  }, [callback]);
}
