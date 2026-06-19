import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TurnstileGate } from '../components/TurnstileGate';

/**
 * Landingsside (revisjon 2).
 *
 * Mørk bakgrunn med dekorative blobs, app-ikon SVG, hvitt bottom-sheet,
 * standard Turnstile-widget og to rolleknapper.
 */
export function LandingPage() {
  const [verified, setVerified] = useState(false);
  const navigate = useNavigate();

  const handleVerified = (_token: string) => {
    setVerified(true);
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden flex flex-col justify-end"
      style={{ background: 'oklch(0.19 0.07 165)' }}
    >
      {/* Dekorative blobs */}
      <div
        className="absolute top-[-80px] left-[-60px] w-72 h-72 rounded-full opacity-30 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, oklch(0.45 0.13 165) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute top-[10%] right-[-80px] w-64 h-64 rounded-full opacity-20 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, oklch(0.55 0.17 35) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute bottom-[40%] left-[10%] w-48 h-48 rounded-full opacity-15 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, oklch(0.62 0.17 35) 0%, transparent 70%)',
        }}
      />

      {/* Hero-innhold */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 pt-16">
        {/* App-ikon: 4 ruter SVG */}
        <div className="mb-5">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
            <rect x="4" y="4" width="20" height="20" rx="5" fill="oklch(0.62 0.17 35)" />
            <rect x="32" y="4" width="20" height="20" rx="5" fill="oklch(0.72 0.17 35)" opacity="0.85" />
            <rect x="4" y="32" width="20" height="20" rx="5" fill="oklch(0.72 0.17 35)" opacity="0.85" />
            <rect x="32" y="32" width="20" height="20" rx="5" fill="oklch(0.82 0.12 35)" opacity="0.6" />
          </svg>
        </div>

        <h1
          className="text-4xl font-extrabold tracking-tight text-white mb-2"
          style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800 }}
        >
          Estimat
        </h1>
        <p
          className="text-base text-white/60 text-center max-w-xs"
          style={{ fontFamily: 'DM Sans, sans-serif' }}
        >
          Planning Poker for teamet — estimer størrelse og verdi i sanntid
        </p>
      </div>

      {/* Hvitt bottom-sheet */}
      <div
        className="w-full px-5 pb-10 pt-6 space-y-5"
        style={{
          background: 'white',
          borderRadius: '28px 28px 0 0',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-1">
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: 'oklch(0.85 0.01 165)' }}
          />
        </div>

        {/* Turnstile */}
        <div className="space-y-1">
          <p
            className="text-center text-sm text-gray-500"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            Bekreft at du er et menneske
          </p>
          <TurnstileGate onSuccess={handleVerified} theme="light" />
        </div>

        {/* Rolleknapper */}
        <div className="space-y-3">
          {/* Deltaker-knapp */}
          <button
            type="button"
            disabled={!verified}
            onClick={() => navigate('/join')}
            className="w-full py-4 px-6 rounded-2xl font-semibold text-white text-base transition-all flex items-center justify-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{
              background: verified ? 'oklch(0.30 0.08 165)' : 'oklch(0.70 0.04 165)',
              fontFamily: 'Sora, sans-serif',
              fontWeight: 600,
              cursor: verified ? 'pointer' : 'not-allowed',
              opacity: verified ? 1 : 0.6,
              // eslint-disable-next-line @typescript-eslint/prefer-as-const
              ...(verified ? { boxShadow: '0 2px 12px oklch(0.30 0.08 165 / 0.35)' } : {}),
            }}
          >
            {/* Bruker-SVG */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="7" r="3.5" fill="white" />
              <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            Deltager
          </button>

          {/* Fasilitator-knapp */}
          <button
            type="button"
            disabled={!verified}
            onClick={() => navigate('/dashboard')}
            className="w-full py-4 px-6 rounded-2xl font-semibold text-base transition-all flex items-center justify-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-offset-2 border-2"
            style={{
              background: 'transparent',
              color: verified ? 'oklch(0.30 0.08 165)' : 'oklch(0.65 0.04 165)',
              borderColor: verified ? 'oklch(0.30 0.08 165)' : 'oklch(0.80 0.04 165)',
              fontFamily: 'Sora, sans-serif',
              fontWeight: 600,
              cursor: verified ? 'pointer' : 'not-allowed',
              opacity: verified ? 1 : 0.6,
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
            className="text-center text-xs text-gray-400"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            Løs verifiseringen ovenfor for å fortsette
          </p>
        )}
      </div>
    </div>
  );
}
