import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TurnstileGate } from '../components/TurnstileGate';

/**
 * Landingsside.
 * Viser Turnstile-widget og to knapper: Deltaker / Fasilitator.
 * Navigering låst til Turnstile er løst.
 */
export function LandingPage() {
  const [verified, setVerified] = useState(false);
  const navigate = useNavigate();

  const handleVerified = (_token: string) => {
    setVerified(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo / tittel */}
        <div className="text-center">
          <div className="text-5xl mb-4">🃏</div>
          <h1 className="text-3xl font-bold text-gray-900">Estimering</h1>
          <p className="mt-2 text-gray-500">Planning Poker for teamet</p>
        </div>

        {/* Turnstile */}
        <div className="space-y-2">
          <p className="text-center text-sm text-gray-500">Bekreft at du er et menneske</p>
          <TurnstileGate onSuccess={handleVerified} />
        </div>

        {/* Valg-knapper */}
        <div className="space-y-3">
          <button
            type="button"
            disabled={!verified}
            onClick={() => navigate('/vote')}
            className={[
              'w-full py-4 px-6 rounded-xl font-semibold text-white text-lg transition-all',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
              verified
                ? 'bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-md'
                : 'bg-blue-300 cursor-not-allowed opacity-60',
            ].join(' ')}
          >
            👤 Deltaker
          </button>

          <button
            type="button"
            disabled={!verified}
            onClick={() => navigate('/dashboard')}
            className={[
              'w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500',
              'border-2',
              verified
                ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 active:scale-95 shadow-sm'
                : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60',
            ].join(' ')}
          >
            🎯 Fasilitator
          </button>
        </div>

        {!verified && (
          <p className="text-center text-xs text-gray-400">
            Løs verifiseringen ovenfor for å fortsette
          </p>
        )}
      </div>
    </div>
  );
}
