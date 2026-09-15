import { useNavigate } from 'react-router-dom';
import { AppLogo } from '../components/AppLogo';
import { resolveRoomRoute } from '../lib/roomRoutes';

/**
 * Landingsside – Gjensidige Builders designsystem.
 *
 * Mørk navy-bakgrunn med dekorative blobs, app-ikon SVG, hvitt bottom-sheet
 * og to rolleknapper.
 */
export function LandingPage() {
  const navigate = useNavigate();
  const preloadParticipantFlow = () => {
    void Promise.all([import('../app/SessionRoutes'), import('./DeltagerJoin')]).catch(() => undefined);
  };
  const preloadFacilitatorFlow = () => {
    void Promise.all([import('../app/SessionRoutes'), import('./FacilitatorActivityChooser')]).catch(() => undefined);
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

        {/* Rolleknapper */}
        <div className="space-y-3">
          {/* Deltaker-knapp */}
          <button
            type="button"
            onPointerEnter={preloadParticipantFlow}
            onFocus={preloadParticipantFlow}
            onClick={() => navigate(resolveRoomRoute('estimation', 'join'))}
            className="w-full py-4 px-6 font-semibold text-white text-base transition-all flex items-center justify-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{
              background: 'var(--color-red-600)',
              color: 'white',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(200,0,45,0.35)',
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
            onPointerEnter={preloadFacilitatorFlow}
            onFocus={preloadFacilitatorFlow}
            onClick={() => navigate('/facilitator')}
            className="w-full py-4 px-6 font-semibold text-base transition-all flex items-center justify-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{
              background: 'transparent',
              color: 'var(--color-red-600)',
              border: '2px solid var(--color-red-600)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              cursor: 'pointer',
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
      </div>
    </div>
  );
}
