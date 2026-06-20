import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TurnstileGate } from '../components/TurnstileGate';
import { AppLogo } from '../components/AppLogo';

/**
 * Landingsside – Gjensidige Builders designsystem.
 *
 * Mørk navy-bakgrunn med dekorative blobs, app-ikon SVG, hvitt bottom-sheet,
 * standard Turnstile-widget og to rolleknapper.
 */
export function LandingPage() {
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState(false);
  const navigate = useNavigate();

  const handleVerified = async (token: string) => {
    setVerifyError(false);
    try {
      const res = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json() as { success: boolean };
      if (data.success) {
        setVerified(true);
      } else {
        // Server avviste tokenet – vis feil og la brukeren prøve igjen
        setVerifyError(true);
        setVerified(false);
      }
    } catch {
      // Nettverksfeil: IKKE tillat videre – vis feilmelding
      setVerifyError(true);
      setVerified(false);
    }
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden flex flex-col justify-end"
      style={{ background: 'var(--color-navy-900)' }}
    >
      {/* Dekorative blobs */}
      <div
        className="absolute top-[-80px] left-[-60px] w-72 h-72 rounded-full opacity-30 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--color-navy-700) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute top-[10%] right-[-80px] w-64 h-64 rounded-full opacity-20 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--color-red-600) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute bottom-[40%] left-[10%] w-48 h-48 rounded-full opacity-15 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--color-red-400) 0%, transparent 70%)',
        }}
      />

      {/* Hero-innhold */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 pt-16">
        {/* App-ikon */}
        <div className="mb-5">
          <AppLogo size={80} />
        </div>

        <h1
          className="text-4xl font-extrabold tracking-tight text-white mb-2"
          style={{ fontWeight: 800 }}
        >
          Estimat
        </h1>
        <p
          className="text-base text-center max-w-xs"
          style={{ color: '#7A93B8' }}
        >
          Planning Poker for teamet — estimer størrelse og verdi i sanntid
        </p>
      </div>

      {/* Hvitt bottom-sheet */}
      <div
        className="w-full px-5 pb-10 pt-6 space-y-5"
        style={{
          background: 'white',
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-1">
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: 'var(--color-neutral-200)' }}
          />
        </div>

        {/* Turnstile */}
        <div className="space-y-1">
          <p
            className="text-center text-sm"
            style={{ color: 'var(--color-neutral-500)' }}
          >
            Bekreft at du er et menneske
          </p>
          <TurnstileGate onSuccess={handleVerified} theme="light" />
          {verifyError && (
            <p
              className="text-center text-xs"
              style={{ color: 'var(--color-danger)' }}
            >
              Verifisering mislyktes. Prøv igjen.
            </p>
          )}
        </div>

        {/* Rolleknapper */}
        <div className="space-y-3">
          {/* Deltaker-knapp */}
          <button
            type="button"
            disabled={!verified}
            onClick={() => navigate('/join')}
            className="w-full py-4 px-6 font-semibold text-white text-base transition-all flex items-center justify-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{
              background: verified ? 'var(--color-red-600)' : 'var(--color-neutral-200)',
              color: verified ? 'white' : 'var(--color-neutral-400)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              cursor: verified ? 'pointer' : 'not-allowed',
              ...(verified ? { boxShadow: '0 2px 12px rgba(200,0,45,0.35)' } : {}),
            }}
          >
            {/* Bruker-SVG */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="7" r="3.5" fill="currentColor" />
              <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            Deltager
          </button>

          {/* Fasilitator-knapp */}
          <button
            type="button"
            disabled={!verified}
            onClick={() => navigate('/dashboard')}
            className="w-full py-4 px-6 font-semibold text-base transition-all flex items-center justify-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{
              background: 'transparent',
              color: verified ? 'var(--color-red-600)' : 'var(--color-neutral-400)',
              border: `2px solid ${verified ? 'var(--color-red-600)' : 'var(--color-neutral-300)'}`,
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              cursor: verified ? 'pointer' : 'not-allowed',
            }}
          >
            {/* Grid-SVG */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="6" height="6" rx="1.5" fill="currentColor" />
              <rect x="12" y="2" width="6" height="6" rx="1.5" fill="currentColor" />
              <rect x="2" y="12" width="6" height="6" rx="1.5" fill="currentColor" />
              <rect x="12" y="12" width="6" height="6" rx="1.5" fill="currentColor" />
            </svg>
            Fasilitator
          </button>
        </div>

        {!verified && (
          <p
            className="text-center text-xs"
            style={{ color: 'var(--color-neutral-400)' }}
          >
            Løs verifiseringen ovenfor for å fortsette
          </p>
        )}
      </div>
    </div>
  );
}
