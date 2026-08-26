import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLogo } from '../components/AppLogo';
import { NavyPageLayout } from '../components/NavyPageLayout';
import { resolveRoomRoute } from '../lib/roomRoutes';
import { useSession } from '../hooks/useSession';

const cardClassName = 'w-full rounded-xl border bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2';

export function FacilitatorActivityChooserPage() {
  const navigate = useNavigate();
  const { activityType, localParticipant, session } = useSession();

  useEffect(() => {
    if (!session || !activityType || !localParticipant) return;
    navigate(resolveRoomRoute(
      activityType,
      localParticipant.role === 'facilitator' ? 'facilitator' : 'participant',
    ), { replace: true });
  }, [activityType, localParticipant, navigate, session]);

  return (
    <NavyPageLayout
      roleLabel="Fasilitator"
      onBack={() => navigate('/')}
      navyContent={
        <div className="text-center">
          <AppLogo size={56} className="mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white">Velg aktivitet</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-navy-200)' }}>
            Hva vil du samle teamet om?
          </p>
        </div>
      }
    >
      <main className="mx-auto grid w-full max-w-2xl gap-4 pb-10 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => navigate(resolveRoomRoute('estimation', 'facilitator'))}
          className={cardClassName}
          style={{ borderColor: 'var(--color-neutral-200)' }}
        >
          <span className="text-xl font-bold" style={{ color: 'var(--color-navy-900)' }}>Estimering</span>
          <span className="mt-2 block text-sm" style={{ color: 'var(--color-neutral-700)' }}>
            Estimer størrelse og verdi sammen i sanntid.
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate(resolveRoomRoute('health_check', 'facilitator'))}
          className={cardClassName}
          style={{ borderColor: 'var(--color-neutral-200)' }}
        >
          <span className="text-xl font-bold" style={{ color: 'var(--color-navy-900)' }}>Helsesjekk</span>
          <span className="mt-2 block text-sm" style={{ color: 'var(--color-neutral-700)' }}>
            Mål arbeidsglede, trygghet og samarbeid som et samlet grupperesultat.
          </span>
        </button>
      </main>
    </NavyPageLayout>
  );
}
