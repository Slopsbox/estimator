import { useMemo } from 'react';
import { PriorityMatrix } from '../PriorityMatrix';
import { SpreadOMeter } from '../SpreadOMeter';
import { VALUE_MEDAL } from '../../lib/constants';
import { requiresReestimation } from '../../lib/spreadOMeter';
import type { Participant, Value, Vote } from '../../lib/types';
import { avatarColor, initials } from '../../lib/utils';

export interface VotesPanelProps {
  participants: Participant[];
  votes: Vote[];
  revealed: boolean;
  votedCount: number;
  totalCount: number;
  actionLoading: boolean;
  consensusStreak: number;
  presentParticipantIds?: ReadonlySet<string>;
  reestimatingParticipantIds?: ReadonlySet<string>;
  votedParticipantIds?: ReadonlySet<string>;
  onReveal: () => void;
  onNextRound: () => void;
}

/** Returner riktig antall flamme-emojier for streaken. */
function streakFlames(streak: number): string {
  if (streak >= 6) return '🔥🔥🔥';
  if (streak >= 4) return '🔥🔥';
  return '🔥';
}

export function VotesPanel({
  participants,
  votes,
  revealed,
  votedCount,
  totalCount,
  actionLoading,
  consensusStreak,
  presentParticipantIds,
  reestimatingParticipantIds,
  votedParticipantIds,
  onReveal,
  onNextRound,
}: VotesPanelProps) {
  // Bygg oppslag: participantId → vote (memoisert)
  const voteMap = useMemo(() => new Map(votes.map((v) => [v.participant_id, v])), [votes]);
  const needsReestimation = revealed && requiresReestimation(votes);


  return (
    <div className="space-y-4">
      {/* Reveal-panel */}
      <div
        className="p-3 space-y-2"
        style={{
          background: 'var(--color-neutral-100)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <p
          className="text-sm text-center"
          style={{ color: 'var(--color-neutral-500)' }}
        >
          {votedCount} av {totalCount} har stemt
        </p>
        {!revealed ? (
          <button
            type="button"
            onClick={onReveal}
            disabled={actionLoading || votedCount === 0}
            className="w-full py-3 font-semibold text-white text-sm transition-all focus:outline-none"
            style={{
              borderRadius: 'var(--radius-md)',
              background:
                actionLoading || votedCount === 0
                  ? 'var(--color-neutral-200)'
                  : 'var(--color-navy-900)',
              color: actionLoading || votedCount === 0 ? 'var(--color-neutral-400)' : 'white',
              cursor: actionLoading || votedCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Vis resultater 🃏
          </button>
        ) : (
          <button
            type="button"
            onClick={onNextRound}
            disabled={actionLoading}
            className="w-full py-3 font-semibold text-sm transition-all focus:outline-none flex items-center justify-center gap-2"
            style={{
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              color: 'var(--color-neutral-700)',
              border: '1.5px solid var(--color-neutral-200)',
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
            {needsReestimation ? 'Diskuter og estimer på nytt' : 'Ny runde'}
          </button>
        )}
      </div>

      {/* Teamets risikovurdering – vises etter avsløring */}
      {revealed && votes.length > 0 && (
        <SpreadOMeter votes={votes} />
      )}

      {/* Stemmeliste */}
      {participants.length === 0 ? (
        <p
          className="text-sm text-center py-2"
          style={{ color: 'var(--color-neutral-500)' }}
        >
          Ingen deltakere ennå.
        </p>
      ) : (
        <ul className="space-y-2">
          {participants.map((p) => {
            const vote = voteMap.get(p.id);
            const hasVoted = vote !== undefined || votedParticipantIds?.has(p.id) === true;
            const online = presentParticipantIds?.has(p.id) ?? false;
            return (
              <li key={p.id} className="flex items-center gap-3">
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
                <span className="text-xs flex items-center gap-1" style={{ color: online ? 'var(--color-success)' : 'var(--color-neutral-500)' }} aria-label={`${p.name} er ${online ? 'online' : 'offline'}`}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: online ? 'var(--color-success)' : 'var(--color-neutral-300)' }} aria-hidden="true" />
                  {online ? 'online' : 'offline'}
                </span>
                {/* Stemme-status */}
                {hasVoted ? (
                  revealed ? (
                    /* Avslørt stemme */
                    <span
                      className="text-sm font-bold px-2 py-0.5"
                      style={{
                        background: 'var(--color-neutral-200)',
                        color: 'var(--color-neutral-900)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      {vote ? `${vote.size.toUpperCase()} ${VALUE_MEDAL[vote.value as Value]}` : 'Ukjent'}
                    </span>
                  ) : (
                    /* Klar */
                    <span
                      className="text-xs font-medium px-2 py-0.5"
                      style={{
                        background: '#E8F4ED',
                        color: 'var(--color-success)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      Klar ✓
                    </span>
                  )
                ) : reestimatingParticipantIds?.has(p.id) ? (
                  /* Re-estimerer – hadde stemme, slettet den (Amalieknappen) */
                  <span
                    className="text-xs px-2 py-0.5 flex items-center gap-1"
                    style={{
                      background: '#F0E6FF',
                      color: '#6B21A8',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    ↩️ Re-estimerer...
                  </span>
                ) : (
                  /* Venter */
                  <span
                    className="text-xs px-2 py-0.5 flex items-center gap-1"
                    style={{
                      background: '#FFF4E0',
                      color: 'var(--color-warning)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full animate-pulse-slow inline-block"
                      style={{ background: 'var(--color-warning)' }}
                    />
                    Venter…
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Konsensus-streak badge – vises etter avsløring, streak >= 2 */}
      {revealed && !needsReestimation && consensusStreak >= 2 && (
        <div
          className="flex items-center justify-center gap-2 px-4 py-2 animate-slideIn"
          style={{
            background: 'linear-gradient(135deg, #CC8000 0%, #C8002D 100%)',
            borderRadius: 'var(--radius-full)',
          }}
          role="status"
          aria-label={`Konsensus-streak: ${consensusStreak} runder`}
        >
          <span className="text-lg">{streakFlames(consensusStreak)}</span>
          <span className="text-sm font-bold text-white">
            {consensusStreak} runder med konsensus!
          </span>
        </div>
      )}

      {/* Prioriteringsanbefaling – vises etter avsløring */}
      {revealed && votes.length > 0 && !needsReestimation && (
        <PriorityMatrix votes={votes} />
      )}
    </div>
  );
}
