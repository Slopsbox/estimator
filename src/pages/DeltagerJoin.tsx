import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

/**
 * Deltager-join-side – Gjensidige Builders designsystem.
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

    // Bruker full page navigation i stedet for React Router navigate().
    // Årsak: useSession er en hook med lokal state per komponent-instans.
    // Med navigate('/vote') monteres Vote.tsx med EN NY useSession-instans som
    // starter med session=null og må gjenopprette fra sessionStorage asynkront.
    // I det korte vinduet før gjenoppretting er ferdig (initialized=false) vises
    // ingenting og brukeren "henger" på join-siden.
    // window.location.href tvinger full re-mount med fresh sessionStorage-lesing,
    // slik at gjenopprettingen starter fra en ren tilstand og alltid finner dataene.
    window.location.href = '/vote';
  };

  const canSubmit = name.trim().length > 0 && code.length === 4;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--color-neutral-100)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-4"
        style={{
          background: 'white',
          borderBottom: '1px solid var(--color-neutral-200)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center justify-center w-9 h-9 transition-colors"
          style={{
            background: 'var(--color-neutral-100)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-neutral-700)',
          }}
          aria-label="Tilbake"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1
          className="text-lg font-semibold"
          style={{ color: 'var(--color-neutral-900)', fontWeight: 700 }}
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
              style={{ color: 'var(--color-neutral-900)', fontWeight: 700 }}
            >
              Skriv inn koden
            </h2>
            <p
              className="text-sm"
              style={{ color: 'var(--color-neutral-500)' }}
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
                style={{ color: 'var(--color-neutral-700)' }}
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
                className="w-full px-4 py-3 text-sm focus:outline-none transition-colors"
                style={{
                  border: `1.5px solid ${nameError ? 'var(--color-danger)' : 'var(--color-neutral-300)'}`,
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-neutral-900)',
                  background: 'white',
                  boxShadow: nameError ? '0 0 0 3px rgba(200,0,45,.12)' : 'none',
                }}
              />
              {nameError && (
                <p
                  className="mt-1 text-sm animate-slideIn"
                  style={{ color: 'var(--color-danger)' }}
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
                style={{ color: 'var(--color-neutral-700)' }}
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
                  'w-full text-center font-extrabold transition-colors',
                  'focus:outline-none',
                  shaking ? 'animate-shake' : '',
                ].join(' ')}
                style={{
                  fontSize: '2.5rem',
                  letterSpacing: '0.3em',
                  padding: '0.75rem 1rem',
                  color: 'var(--color-neutral-900)',
                  background: 'white',
                  border: `2px solid ${
                    codeError
                      ? 'var(--color-danger)'
                      : code.length === 4
                      ? 'var(--color-danger)'
                      : 'var(--color-neutral-300)'
                  }`,
                  borderRadius: 'var(--radius-md)',
                  boxShadow: codeError
                    ? '0 0 0 3px rgba(200,0,45,.12)'
                    : code.length === 4
                    ? '0 0 0 3px rgba(200,0,45,.12)'
                    : 'none',
                }}
              />
              {codeError && (
                <div
                  role="alert"
                  className="mt-3 flex items-center gap-2 px-4 py-3 animate-slideIn"
                  style={{
                    background: 'var(--color-red-50)',
                    border: `1.5px solid var(--color-danger)`,
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>❌</span>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    {codeError}
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full py-4 font-semibold text-white text-base transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 flex items-center justify-center gap-2"
              style={{
                fontWeight: 600,
                background:
                  canSubmit && !loading
                    ? 'var(--color-navy-900)'
                    : 'var(--color-neutral-200)',
                color: canSubmit && !loading ? 'white' : 'var(--color-neutral-400)',
                borderRadius: 'var(--radius-md)',
                cursor: canSubmit && !loading ? 'pointer' : 'not-allowed',
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
