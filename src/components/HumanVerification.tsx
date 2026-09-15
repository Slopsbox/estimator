import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getAccessToken } from '../lib/supabase';
import {
  hasRecentTurnstileVerification,
  markTurnstileVerified,
  turnstileVerificationRemainingMs,
} from '../lib/turnstileAttestation';
import { TurnstileGate } from './TurnstileGate';

interface HumanVerificationState {
  verified: boolean;
  verifying: boolean;
}

interface HumanVerificationProps {
  children: (state: HumanVerificationState) => ReactNode;
}

export function HumanVerification({ children }: HumanVerificationProps) {
  const [verified, setVerified] = useState(hasRecentTurnstileVerification);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const accessTokenRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    if (verified) return;
    accessTokenRef.current = getAccessToken();
    void accessTokenRef.current.catch(() => undefined);
  }, [verified]);

  useEffect(() => {
    if (!verified) return;
    const timeout = window.setTimeout(
      () => setVerified(false),
      Math.max(0, turnstileVerificationRemainingMs()),
    );
    return () => window.clearTimeout(timeout);
  }, [verified]);

  const handleVerified = async (challengeToken: string) => {
    setVerifyError(false);
    setVerifying(true);
    const controller = new AbortController();
    let timeout: number | undefined;
    try {
      const verification = (async () => {
        const accessToken = await (accessTokenRef.current ?? getAccessToken());
        controller.signal.throwIfAborted();
        const response = await fetch('/api/verify-turnstile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ token: challengeToken }),
          signal: controller.signal,
        });
        const data = await response.json() as { success?: boolean };
        if (!response.ok || data.success !== true) throw new Error('verification_failed');
      })();
      await Promise.race([
        verification,
        new Promise<never>((_resolve, reject) => {
          timeout = window.setTimeout(() => {
            controller.abort();
            reject(new Error('verification_timeout'));
          }, 10_000);
        }),
      ]);
      markTurnstileVerified();
      setVerified(true);
    } catch {
      accessTokenRef.current = null;
      setVerifyError(true);
      setAttempt((current) => current + 1);
    } finally {
      if (timeout) window.clearTimeout(timeout);
      setVerifying(false);
    }
  };

  return (
    <>
      {!verified && (
        <div className="mb-5 space-y-2 rounded-xl border border-[var(--color-neutral-200)] bg-white p-4">
          <p className="text-center text-sm" style={{ color: 'var(--color-neutral-700)' }}>
            Bekreft at du er et menneske for å fortsette
          </p>
          <TurnstileGate key={attempt} onSuccess={handleVerified} theme="light" />
          {verifying && (
            <p className="text-center text-xs" role="status" style={{ color: 'var(--color-neutral-500)' }}>
              Verifiserer…
            </p>
          )}
          {verifyError && (
            <p className="text-center text-xs" role="alert" style={{ color: 'var(--color-danger)' }}>
              Verifisering mislyktes. Prøv igjen.
            </p>
          )}
        </div>
      )}
      {children({ verified, verifying })}
    </>
  );
}
