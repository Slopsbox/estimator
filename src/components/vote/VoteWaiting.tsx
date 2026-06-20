import type { Session, LocalParticipant } from '../../lib/types';

interface VoteWaitingProps {
  session: Session;
  name: string;
}

/**
 * State W – Venter på fasilitator (session.started === false).
 */
export function VoteWaiting({ session, name }: VoteWaitingProps) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-10"
      style={{ background: 'oklch(0.965 0.012 165)' }}
    >
      <div className="w-full max-w-sm text-center space-y-6 animate-fadeUp">
        {/* Ikon */}
        <div className="text-7xl animate-pulse-slow">⏳</div>

        <div>
          <h2
            className="text-2xl font-bold"
            style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
          >
            Venter på fasilitator…
          </h2>
          <p
            className="mt-2 text-base"
            style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.45 0.05 165)' }}
          >
            Du er med i sesjonen, {name} 👋
          </p>
        </div>

        {/* Info-kort */}
        <div
          className="bg-white rounded-2xl p-4 space-y-3"
          style={{ boxShadow: '0 2px 16px oklch(0.20 0.06 165 / 0.07)' }}
        >
          <div className="flex justify-between items-center">
            <span
              className="text-sm"
              style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.50 0.04 165)' }}
            >
              Sesjonskode
            </span>
            <span
              className="font-bold text-sm tracking-widest"
              style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.30 0.08 165)' }}
            >
              {session.join_code}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span
              className="text-sm"
              style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.50 0.04 165)' }}
            >
              Runde
            </span>
            <span
              className="font-bold text-sm"
              style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.30 0.08 165)' }}
            >
              {session.current_round}
            </span>
          </div>
        </div>

        <p
          className="text-sm animate-pulse-slow"
          style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.55 0.04 165)' }}
        >
          • Fasilitator starter snart •
        </p>
      </div>
    </div>
  );
}

// LocalParticipant importeres ikke i bruk her, men typesjekk er gjort via props
export type { VoteWaitingProps };
export type { LocalParticipant };
