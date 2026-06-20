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
      style={{ background: 'var(--color-neutral-100)' }}
    >
      <div className="w-full max-w-sm text-center space-y-6 animate-fadeUp">
        {/* Ikon */}
        <div className="text-7xl animate-pulse-slow">⏳</div>

        <div>
          <h2
            className="text-2xl font-bold"
            style={{ color: 'var(--color-neutral-900)' }}
          >
            Venter på fasilitator…
          </h2>
          <p
            className="mt-2 text-base"
            style={{ color: 'var(--color-neutral-500)' }}
          >
            Du er med i sesjonen, {name} 👋
          </p>
        </div>

        {/* Info-kort */}
        <div
          className="bg-white p-4 space-y-3"
          style={{
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="flex justify-between items-center">
            <span
              className="text-sm"
              style={{ color: 'var(--color-neutral-500)' }}
            >
              Sesjonskode
            </span>
            <span
              className="font-bold text-sm tracking-widest"
              style={{ color: 'var(--color-neutral-900)' }}
            >
              {session.join_code}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span
              className="text-sm"
              style={{ color: 'var(--color-neutral-500)' }}
            >
              Runde
            </span>
            <span
              className="font-bold text-sm"
              style={{ color: 'var(--color-neutral-900)' }}
            >
              {session.current_round}
            </span>
          </div>
        </div>

        <p
          className="text-sm animate-pulse-slow"
          style={{ color: 'var(--color-neutral-400)' }}
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
