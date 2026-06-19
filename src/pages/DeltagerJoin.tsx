import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

/**
 * Deltager-join-side.
 * Lar deltaker taste inn navn og 4-tegns sesjonskode for å bli med.
 * Navn lagres i sessionStorage for fremtidige runder.
 */
export function DeltagerJoinPage() {
  const navigate = useNavigate();
  const { joinSession, loading } = useSession();

  const [name, setName] = useState(() => {
    return sessionStorage.getItem('estimering_vote_name') ?? '';
  });
  const [nameError, setNameError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    if (nameError) setNameError(null);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 4);
    setCode(val);
    if (codeError) setCodeError(null);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;

    if (!name.trim()) {
      setNameError('Skriv inn ditt navn for å fortsette.');
      hasError = true;
    }

    if (code.length < 4) {
      setCodeError('Skriv inn den 4-tegns koden fra fasilitator.');
      hasError = true;
    }

    if (hasError) return;

    setCodeError(null);
    setNameError(null);

    const ok = await joinSession(code, name.trim());

    if (!ok) {
      console.warn('[DeltagerJoin] joinSession returnerte false – feil kode?', {
        kode: code,
        navn: name.trim(),
      });
      setCodeError('Feil kode — prøv igjen.');
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      codeInputRef.current?.focus();
      return;
    }

    navigate('/vote');
  };

  const canSubmit = name.trim().length > 0 && code.length === 4;

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

          <form onSubmit={handleJoin} className="space-y-4">
            {/* Navn-input – øverst */}
            <div>
              <label
                htmlFor="join-name"
                className="block text-sm font-medium mb-1.5"
                style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.35 0.05 165)' }}
              >
                Ditt navn
              </label>
              <input
                id="join-name"
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder="Skriv inn ditt navn"
                maxLength={60}
                autoFocus
                className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none transition-colors"
                style={{
                  borderColor: nameError ? 'oklch(0.52 0.18 25)' : 'oklch(0.88 0.02 165)',
                  color: 'oklch(0.20 0.06 165)',
                  fontFamily: 'DM Sans, sans-serif',
                  boxShadow: nameError ? '0 0 0 3px oklch(0.52 0.18 25 / 0.15)' : 'none',
                }}
              />
              {nameError && (
                <p
                  className="mt-1 text-sm animate-slideIn"
                  style={{ color: 'oklch(0.52 0.18 25)', fontFamily: 'DM Sans, sans-serif' }}
                >
                  {nameError}
                </p>
              )}
            </div>

            {/* Kode-input */}
            <div>
              <label
                htmlFor="join-code"
                className="block text-sm font-medium mb-1.5"
                style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.35 0.05 165)' }}
              >
                Sesjonskode
              </label>
              <input
                id="join-code"
                ref={codeInputRef}
                type="text"
                value={code}
                onChange={handleCodeChange}
                maxLength={4}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="– – – –"
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
                  borderColor: codeError
                    ? 'oklch(0.52 0.18 25)'
                    : code.length === 4
                    ? 'oklch(0.30 0.08 165)'
                    : 'oklch(0.85 0.02 165)',
                  boxShadow: codeError
                    ? '0 0 0 3px oklch(0.52 0.18 25 / 0.15)'
                    : code.length === 4
                    ? '0 0 0 3px oklch(0.30 0.08 165 / 0.15)'
                    : 'none',
                }}
              />
              {codeError && (
                <div
                  role="alert"
                  className="mt-3 flex items-center gap-2 px-4 py-3 rounded-xl animate-slideIn"
                  style={{
                    background: 'oklch(0.95 0.05 25)',
                    border: '1.5px solid oklch(0.52 0.18 25)',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>❌</span>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: 'oklch(0.40 0.18 25)' }}
                  >
                    {codeError}
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full py-4 rounded-2xl font-semibold text-white text-base transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 flex items-center justify-center gap-2"
              style={{
                fontFamily: 'Sora, sans-serif',
                fontWeight: 600,
                background:
                  canSubmit && !loading
                    ? 'oklch(0.30 0.08 165)'
                    : 'oklch(0.75 0.04 165)',
                cursor: canSubmit && !loading ? 'pointer' : 'not-allowed',
                opacity: canSubmit && !loading ? 1 : 0.6,
              }}
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Kobler til…
                </>
              ) : (
                'Bli med'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
