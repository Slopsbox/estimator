import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLogo } from '../components/AppLogo';
import { NavyPageLayout } from '../components/NavyPageLayout';
import { useSession } from '../hooks/useSession';

/**
 * Deltager-join-side – Gjensidige Builders designsystem (rev3).
 * Navy topp-seksjon + varm-grå bunn, matcher fasilitator-mønsteret.
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
    <NavyPageLayout
      roleLabel="Deltager"
      onBack={() => navigate('/')}
      navyContent={
        <div className="text-center">
          <AppLogo size={56} className="mx-auto mb-4" />
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0 }}>
            Bli med i sesjon
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
            Skriv inn koden fra fasilitator
          </p>
        </div>
      }
    >
      <form onSubmit={handleJoin} className="space-y-4">
        {/* Navn-input */}
        <div>
          <label
            htmlFor="join-name"
            className="block mb-2"
            style={{ fontSize: 14, fontWeight: 500, color: '#0B1D3A' }}
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
            className="w-full focus:outline-none transition-colors"
            style={{
              height: 52,
              borderRadius: 12,
              border: `1.5px solid ${nameError ? '#C8002D' : '#E2E0DC'}`,
              background: '#fff',
              padding: '0 16px',
              fontSize: 16,
              color: '#0B1D3A',
            }}
            onFocus={(e) => {
              if (!nameError) e.currentTarget.style.borderColor = '#0B1D3A';
            }}
            onBlur={(e) => {
              if (!nameError) e.currentTarget.style.borderColor = '#E2E0DC';
            }}
          />
          {nameError && (
            <p className="mt-1 text-sm animate-slideIn" style={{ color: '#C8002D' }}>
              {nameError}
            </p>
          )}
        </div>

        {/* Kode-input */}
        <div>
          <label
            htmlFor="join-code"
            className="block mb-2"
            style={{ fontSize: 14, fontWeight: 500, color: '#0B1D3A' }}
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
              color: '#0B1D3A',
              background: '#fff',
              border: `1.5px solid ${
                codeError
                  ? '#C8002D'
                  : code.length === 4
                  ? '#0B1D3A'
                  : '#E2E0DC'
              }`,
              borderRadius: 12,
            }}
          />
          {codeError && (
            <div
              role="alert"
              className="mt-3 flex items-center gap-2 px-4 py-3 animate-slideIn"
              style={{
                background: 'var(--color-red-50)',
                border: '1.5px solid #C8002D',
                borderRadius: 12,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>❌</span>
              <p className="text-sm font-semibold" style={{ color: '#C8002D' }}>
                {codeError}
              </p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="w-full font-semibold text-white focus:outline-none transition-opacity"
          style={{
            height: 52,
            borderRadius: 12,
            background: '#0B1D3A',
            fontSize: 16,
            fontWeight: 600,
            opacity: !canSubmit || loading ? 0.4 : 1,
            cursor: canSubmit && !loading ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
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
            </span>
          ) : (
            'Bli med'
          )}
        </button>
      </form>
    </NavyPageLayout>
  );
}
