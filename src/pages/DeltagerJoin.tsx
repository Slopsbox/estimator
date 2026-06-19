import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

/**
 * Deltager-join-side.
 * Lar deltaker taste inn 4-tegns sesjonskode for å bli med.
 */
export function DeltagerJoinPage() {
  const navigate = useNavigate();
  const { joinSession, loading } = useSession();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 4);
    setCode(val);
    if (error) setError(null);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 4) return;

    setError(null);
    const ok = await joinSession(code);

    if (!ok) {
      setError('Feil kode — prøv igjen.');
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      inputRef.current?.focus();
      return;
    }

    navigate('/vote');
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'oklch(0.965 0.012 165)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-4"
        style={{ background: 'oklch(0.965 0.012 165)' }}
      >
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
          style={{
            background: 'oklch(0.92 0.015 165)',
            color: 'oklch(0.30 0.08 165)',
          }}
          aria-label="Tilbake"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1
          className="text-lg font-semibold"
          style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
        >
          Bli med i sesjon
        </h1>
      </div>

      {/* Innhold */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm animate-fadeUp">
          {/* Ikon + heading */}
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🔑</div>
            <h2
              className="text-2xl font-bold mb-2"
              style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
            >
              Skriv inn koden
            </h2>
            <p
              className="text-sm text-gray-500"
              style={{ fontFamily: 'DM Sans, sans-serif' }}
            >
              Fasilitator deler en 4-tegns kode.
              <br />
              Skriv den inn for å bli med.
            </p>
          </div>

          {/* Kode-input */}
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <input
                ref={inputRef}
                type="text"
                value={code}
                onChange={handleCodeChange}
                maxLength={4}
                autoFocus
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="ABCD"
                className={[
                  'w-full text-center font-extrabold rounded-2xl border-2 transition-colors',
                  'focus:outline-none',
                  shaking ? 'animate-shake' : '',
                ].join(' ')}
                style={{
                  fontFamily: 'Sora, sans-serif',
                  fontSize: '2.5rem',
                  letterSpacing: '0.3em',
                  padding: '0.75rem 1rem',
                  color: 'oklch(0.20 0.06 165)',
                  background: 'white',
                  borderColor: error
                    ? 'oklch(0.52 0.18 25)'
                    : code.length === 4
                    ? 'oklch(0.30 0.08 165)'
                    : 'oklch(0.85 0.02 165)',
                  boxShadow: error
                    ? '0 0 0 3px oklch(0.52 0.18 25 / 0.15)'
                    : code.length === 4
                    ? '0 0 0 3px oklch(0.30 0.08 165 / 0.15)'
                    : 'none',
                }}
              />
              {error && (
                <p
                  className="mt-2 text-center text-sm font-medium animate-slideIn"
                  style={{ color: 'oklch(0.52 0.18 25)', fontFamily: 'DM Sans, sans-serif' }}
                >
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={code.length < 4 || loading}
              className="w-full py-4 rounded-2xl font-semibold text-white text-base transition-all focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{
                fontFamily: 'Sora, sans-serif',
                fontWeight: 600,
                background:
                  code.length === 4 && !loading
                    ? 'oklch(0.30 0.08 165)'
                    : 'oklch(0.75 0.04 165)',
                cursor: code.length === 4 && !loading ? 'pointer' : 'not-allowed',
                opacity: code.length === 4 && !loading ? 1 : 0.6,
              }}
            >
              {loading ? 'Kobler til…' : 'Bli med'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
