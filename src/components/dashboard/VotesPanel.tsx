import { useMemo } from 'react';
import { PriorityMatrix } from '../PriorityMatrix';
import { VALUE_MEDAL } from '../../lib/constants';
import type { Participant, Vote } from '../../lib/types';
import { avatarColor, initials } from '../../lib/utils';

export interface VotesPanelProps {
  participants: Participant[];
  votes: Vote[];
  revealed: boolean;
  votedCount: number;
  totalCount: number;
  actionLoading: boolean;
  onReveal: () => void;
  onNextRound: () => void;
}

export function VotesPanel({
  participants,
  votes,
  revealed,
  votedCount,
  totalCount,
  actionLoading,
  onReveal,
  onNextRound,
}: VotesPanelProps) {
  // Bygg oppslag: participantId → vote (memoisert)
  const voteMap = useMemo(() => new Map(votes.map((v) => [v.participant_id, v])), [votes]);

  return (
    <div className="space-y-4">
      {/* Reveal-panel */}
      <div
        className="rounded-xl p-3 space-y-2"
        style={{ background: 'oklch(0.97 0.010 165)' }}
      >
        <p
          className="text-sm text-center"
          style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.40 0.05 165)' }}
        >
          {votedCount} av {totalCount} har stemt
        </p>
        {!revealed ? (
          <button
            type="button"
            onClick={onReveal}
            disabled={actionLoading || votedCount === 0}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all focus:outline-none"
            style={{
              fontFamily: 'Sora, sans-serif',
              background:
                actionLoading || votedCount === 0
                  ? 'oklch(0.75 0.04 165)'
                  : 'oklch(0.30 0.08 165)',
              cursor: actionLoading || votedCount === 0 ? 'not-allowed' : 'pointer',
              opacity: actionLoading || votedCount === 0 ? 0.6 : 1,
            }}
          >
            Vis resultater 🃏
          </button>
        ) : (
          <button
            type="button"
            onClick={onNextRound}
            disabled={actionLoading}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all focus:outline-none flex items-center justify-center gap-2"
            style={{
              fontFamily: 'Sora, sans-serif',
              background: actionLoading ? 'oklch(0.75 0.04 165)' : 'oklch(0.56 0.17 35)',
              cursor: actionLoading ? 'not-allowed' : 'pointer',
              opacity: actionLoading ? 0.6 : 1,
            }}
          >
            {/* Rotasjon-SVG */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              style={actionLoading ? { animation: 'spin 1s linear infinite' } : undefined}
            >
              <path
                d="M13.5 8A5.5 5.5 0 1 1 8 2.5M13.5 2.5v3h-3"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Ny runde
          </button>
        )}
      </div>

      {/* Stemmeliste */}
      {participants.length === 0 ? (
        <p
          className="text-sm text-center py-2"
          style={{ color: 'oklch(0.55 0.04 165)', fontFamily: 'DM Sans, sans-serif' }}
        >
          Ingen deltakere ennå.
        </p>
      ) : (
        <ul className="space-y-2">
          {participants.map((p) => {
            const vote = voteMap.get(p.id);
            return (
              <li key={p.id} className="flex items-center gap-3">
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
                {/* Stemme-status */}
                {vote ? (
                  revealed ? (
                    <span
                      className="text-sm font-bold"
                      style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.30 0.08 165)' }}
                    >
                      {vote.size.toUpperCase()} {VALUE_MEDAL[vote.value]}
                    </span>
                  ) : (
                    <span
                      className="text-xs font-medium"
                      style={{ color: 'oklch(0.55 0.16 165)', fontFamily: 'DM Sans, sans-serif' }}
                    >
                      Klar ✓
                    </span>
                  )
                ) : (
                  <span
                    className="text-xs"
                    style={{ color: 'oklch(0.65 0.04 165)', fontFamily: 'DM Sans, sans-serif' }}
                  >
                    Venter…
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Prioriteringsanbefaling – vises etter avsløring */}
      {revealed && votes.length > 0 && (
        <PriorityMatrix votes={votes} />
      )}
    </div>
  );
}
