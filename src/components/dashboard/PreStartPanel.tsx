import type { Participant } from '../../lib/types';
import { avatarColor, initials } from '../../lib/utils';

export interface PreStartPanelProps {
  participants: Participant[];
  actionLoading: boolean;
  onStart: () => void;
}

export function PreStartPanel({ participants, actionLoading, onStart }: PreStartPanelProps) {
  const nonFacilitators = participants.filter((p) => p.role === 'participant');

  return (
    <div className="space-y-4">
      {/* Status-tekst */}
      <div className="text-center py-2">
        <p
          className="text-sm font-semibold"
          style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.30 0.08 165)' }}
        >
          Venter på deltakere…
        </p>
        <p
          className="text-xs mt-0.5"
          style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.55 0.04 165)' }}
        >
          {nonFacilitators.length === 0
            ? 'Ingen deltakere ennå'
            : `${nonFacilitators.length} deltaker${nonFacilitators.length === 1 ? '' : 'e'} har joinet`}
        </p>
      </div>

      {/* Deltakerliste */}
      {nonFacilitators.length > 0 && (
        <ul className="space-y-2">
          {nonFacilitators.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-1">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ background: avatarColor(p.name), fontFamily: 'Sora, sans-serif' }}
              >
                {initials(p.name)}
              </div>
              <span
                className="flex-1 text-sm font-medium"
                style={{ color: 'oklch(0.20 0.06 165)', fontFamily: 'DM Sans, sans-serif' }}
              >
                {p.name}
              </span>
              {/* Online-dot */}
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: 'oklch(0.55 0.16 165)' }}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Start sesjon-knapp */}
      <button
        type="button"
        onClick={onStart}
        disabled={actionLoading}
        className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all focus:outline-none"
        style={{
          fontFamily: 'Sora, sans-serif',
          background: actionLoading
            ? 'oklch(0.70 0.08 165)'
            : 'oklch(0.52 0.18 145)',
          cursor: actionLoading ? 'not-allowed' : 'pointer',
          opacity: actionLoading ? 0.6 : 1,
          boxShadow: actionLoading ? 'none' : '0 2px 12px oklch(0.52 0.18 145 / 0.35)',
        }}
      >
        {actionLoading ? 'Starter…' : '▶ Start sesjon'}
      </button>
    </div>
  );
}
