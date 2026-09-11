import type { Participant } from '../../lib/types';
import { avatarColor, initials } from '../../lib/utils';

export interface PreStartPanelProps {
  participants: Participant[];
  presentParticipantIds?: ReadonlySet<string>;
  presenceReady?: boolean;
  actionLoading: boolean;
  onStart: () => void;
}

export function PreStartPanel({ participants, presentParticipantIds = new Set(), presenceReady = false, actionLoading, onStart }: PreStartPanelProps) {
  const nonFacilitators = participants.filter((p) => p.role === 'participant');

  return (
    <div className="space-y-4">
      {/* Status-tekst */}
      <div className="text-center py-2">
        <p
          className="text-sm font-semibold"
          style={{ color: 'var(--color-neutral-900)' }}
        >
          Venter på deltakere…
        </p>
        <p
          className="text-xs mt-0.5"
          style={{ color: 'var(--color-neutral-500)' }}
        >
          {nonFacilitators.length === 0
            ? 'Ingen deltakere ennå'
            : `${nonFacilitators.length} deltaker${nonFacilitators.length === 1 ? '' : 'e'} har joinet`}
        </p>
      </div>

      {/* Deltakerliste */}
      {nonFacilitators.length > 0 && (
        <ul className="space-y-2">
          {nonFacilitators.map((p) => {
            const online = presentParticipantIds.has(p.id);
            const status = presenceReady ? (online ? 'online' : 'offline') : 'status kobles til';
            return <li key={p.id} className="flex items-center gap-3 py-1">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ background: avatarColor(p.name) }}
              >
                {initials(p.name)}
              </div>
              <span
                className="flex-1 text-sm font-medium"
                style={{ color: 'var(--color-neutral-900)' }}
              >
                {p.name}
              </span>
              <span className="flex items-center gap-1.5 text-xs" style={{ color: online ? 'var(--color-success)' : 'var(--color-neutral-500)' }} aria-label={`${p.name} er ${status}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: online ? 'var(--color-success)' : 'var(--color-neutral-300)' }} aria-hidden="true" />
                {status}
              </span>
            </li>;
          })}
        </ul>
      )}

      {/* Start sesjon-knapp */}
      <button
        type="button"
        onClick={onStart}
        disabled={actionLoading}
        className="w-full py-4 font-bold text-white text-base transition-all focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2"
        style={{
          borderRadius: 'var(--radius-md)',
          background: actionLoading
            ? 'var(--color-neutral-200)'
            : 'var(--color-red-600)',
          color: actionLoading ? 'var(--color-neutral-400)' : 'white',
          cursor: actionLoading ? 'not-allowed' : 'pointer',
          boxShadow: actionLoading ? 'none' : '0 2px 12px rgba(200,0,45,.30)',
        }}
      >
        {actionLoading ? 'Starter…' : '▶ Start sesjon'}
      </button>
    </div>
  );
}
