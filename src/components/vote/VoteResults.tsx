import { PriorityMatrix } from '../PriorityMatrix';
import { SpreadOMeter } from '../SpreadOMeter';
import { SIZE_ORDER, VALUE_MEDAL, VALUES } from '../../lib/constants';
import type { LocalParticipant, Size, Value, Vote } from '../../lib/types';

interface VoteResultsProps {
  name: string;
  votes: Vote[];
  selectedSize: Size | null;
  selectedValue: Value | null;
  localParticipant: LocalParticipant | null;
  consensusStreak: number;
}

/** Returner riktig antall flamme-emojier for streaken. */
function streakFlames(streak: number): string {
  if (streak >= 6) return '🔥🔥🔥';
  if (streak >= 4) return '🔥🔥';
  return '🔥';
}

/**
 * State C – Resultater: stemmer avslørt, vis resultatoversikt med konfetti.
 */
export function VoteResults({
  name: _name,
  votes,
  selectedSize,
  selectedValue,
  localParticipant,
  consensusStreak,
}: VoteResultsProps) {
  // Sorter stemmer etter størrelse.
  // DB CHECK-constraints garanterer at size/value alltid er gyldige Size/Value-verdier.
  const sortedVotes = [...votes].sort(
    (a, b) => SIZE_ORDER[a.size as Size] - SIZE_ORDER[b.size as Size],
  );

  // Konsensus-deteksjon
  const uniqueSizes = new Set(votes.map((v) => v.size));
  const hasConsensus = votes.length > 0 && uniqueSizes.size === 1;
  const consensusSize = hasConsensus ? [...uniqueSizes][0] : null;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--color-neutral-100)' }}
    >
      {/* Header */}
      <div className="px-4 py-5 text-center">
        <div className="text-4xl mb-1">🎊</div>
        <h2
          className="text-2xl font-bold"
          style={{ color: 'var(--color-neutral-900)' }}
        >
          Resultater!
        </h2>
      </div>

      <div className="flex-1 px-4 pb-8 space-y-4">
        {/* Konsensus-banner */}
        {hasConsensus && consensusSize && (
          <div
            className="px-4 py-3 text-center animate-slideIn"
            style={{
              background: 'var(--color-success)',
              borderRadius: 'var(--radius-lg)',
              color: 'white',
            }}
          >
            <p
              className="text-base font-bold"
            >
              🎯 Konsensus — alle stemte {consensusSize.toUpperCase()}!
            </p>
          </div>
        )}

        {/* Konsensus-streak badge */}
        {consensusStreak >= 2 && (
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

        {/* Stemmekort */}
        <div className="space-y-2">
          {sortedVotes.map((vote) => {
            const isMine = vote.participant_id === localParticipant?.participantId;
            return (
              <div
                key={vote.id}
                className="bg-white px-4 py-3 flex items-center gap-3 animate-slideIn"
                style={{
                  border: isMine
                    ? '2px solid var(--color-red-600)'
                    : '1.5px solid var(--color-neutral-200)',
                  borderRadius: '10px',
                  boxShadow: isMine
                    ? 'none'
                    : 'var(--shadow-xs)',
                }}
              >
                <span className="text-2xl">{VALUE_MEDAL[vote.value as Value]}</span>
                <span
                  className="flex-1 text-sm font-bold uppercase tracking-wide"
                  style={{ color: 'var(--color-neutral-900)' }}
                >
                  {vote.size.toUpperCase()}
                </span>
                {isMine && (
                  <span
                    className="text-xs px-2 py-0.5 font-medium"
                    style={{
                      background: 'var(--color-red-600)',
                      color: 'white',
                      borderRadius: 'var(--radius-full)',
                    }}
                  >
                    Din
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* SpreadOMeter */}
        {votes.length > 0 && (
          <SpreadOMeter votes={votes} />
        )}

        {/* Prioriteringsanbefaling */}
        {votes.length > 0 && (
          <PriorityMatrix votes={votes} />
        )}

        {/* Din stemme-reminder */}
        {selectedSize && selectedValue && (
          <div
            className="bg-white px-4 py-3"
            style={{
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <p
              className="text-xs mb-1"
              style={{ color: 'var(--color-neutral-500)' }}
            >
              Din stemme
            </p>
            <p
              className="text-sm font-semibold"
              style={{ color: 'var(--color-neutral-900)' }}
            >
              {selectedSize.toUpperCase()} · {VALUE_MEDAL[selectedValue]}{' '}
              {VALUES.find((v) => v.key === selectedValue)?.label}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export type { VoteResultsProps };
