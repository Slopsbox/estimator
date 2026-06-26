import { useEffect, useRef, useState } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

interface TurnstileGateProps {
  onSuccess: (token: string) => void;
  theme?: 'light' | 'dark' | 'auto';
}

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const LOAD_TIMEOUT_MS = 8000; // 8 sekunder timeout

/**
 * Cloudflare Turnstile-widget med feilhåndtering.
 * Hvis widgeten ikke laster innen 8 sekunder (nettverksproblemer),
 * vises en "Prøv igjen" / "Fortsett uten"-løsning.
 */
export function TurnstileGate({ onSuccess, theme = 'light' }: TurnstileGateProps) {
  const siteKey = SITE_KEY ?? '1x00000000000000000000AA';
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Timeout: Hvis widgeten ikke har kalt onSuccess innen X sekunder
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setTimedOut(true);
    }, LOAD_TIMEOUT_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleSuccess = (token: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setTimedOut(false);
    setLoadFailed(false);
    onSuccess(token);
  };

  const handleError = () => {
    setLoadFailed(true);
  };

  const handleRetry = () => {
    setLoadFailed(false);
    setTimedOut(false);
    // Reset timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    // Reset Turnstile-widget
    turnstileRef.current?.reset();
  };

  const handleBypass = () => {
    // For intern app: tillat brukeren å fortsette uten verifisering
    // ved nettverksfeil som hindrer Turnstile fra å laste.
    // handleVerified i Landing.tsx håndterer bypass-token uten server-kall.
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onSuccess('bypass-network-error');
  };

  // Vis feil/timeout-state
  if (loadFailed || timedOut) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <p className="text-sm text-center" style={{ color: 'var(--color-neutral-500)' }}>
          {loadFailed ? 'Verifisering feilet.' : 'Verifisering laster ikke.'}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleRetry}
            className="px-4 py-2 text-sm font-semibold rounded-md"
            style={{
              background: 'var(--color-navy-900)',
              color: 'white',
              borderRadius: 'var(--radius-md)',
            }}
          >
            Prøv igjen
          </button>
          <button
            type="button"
            onClick={handleBypass}
            className="px-4 py-2 text-sm font-semibold rounded-md"
            style={{
              background: 'transparent',
              color: 'var(--color-neutral-500)',
              border: '1.5px solid var(--color-neutral-200)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            Fortsett uten
          </button>
        </div>
        <p className="text-xs text-center" style={{ color: 'var(--color-neutral-400)' }}>
          Nettverksproblemer kan forhindre verifisering
        </p>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <Turnstile
        ref={turnstileRef}
        siteKey={siteKey}
        onSuccess={handleSuccess}
        onError={handleError}
        onExpire={handleError}
        options={{ theme, size: 'normal' }}
      />
    </div>
  );
}
