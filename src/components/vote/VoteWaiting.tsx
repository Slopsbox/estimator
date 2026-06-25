import { AppLogo } from '../AppLogo';
import { NavyPageLayout } from '../NavyPageLayout';
import type { Session, LocalParticipant } from '../../lib/types';

interface VoteWaitingProps {
  session: Session;
  name: string;
}

/**
 * State W – Venter på fasilitator (session.started === false).
 * Navy-topp-mønster: #0B1D3A øverst, #F5F4F0 bunn.
 */
export function VoteWaiting({ session, name }: VoteWaitingProps) {
  return (
    <NavyPageLayout
      roleLabel="Deltager"
      navyContent={
        <div className="text-center">
          <AppLogo size={48} className="mx-auto mb-4" />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>
            Venter på fasilitator…
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
            Du er med i sesjonen, {name} 👋
          </p>
        </div>
      }
    >
      {/* Info-kort */}
      <div className="space-y-5">
        <div
          className="bg-white p-4 space-y-3"
          style={{
            borderRadius: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            border: '1px solid #E2E0DC',
          }}
        >
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: '#6B7280' }}>
              Sesjonskode
            </span>
            <span
              className="font-bold text-sm tracking-widest"
              style={{ color: '#0B1D3A' }}
            >
              {session.join_code}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: '#6B7280' }}>
              Runde
            </span>
            <span className="font-bold text-sm" style={{ color: '#0B1D3A' }}>
              {session.current_round}
            </span>
          </div>
        </div>

        {/* Pulserende status-tekst */}
        <p
          className="text-center animate-pulse-slow"
          style={{ fontSize: 13, color: '#9E9B96' }}
        >
          • Fasilitator starter snart •
        </p>
      </div>
    </NavyPageLayout>
  );
}

// LocalParticipant importeres ikke i bruk her, men typesjekk er gjort via props
export type { VoteWaitingProps };
export type { LocalParticipant };
