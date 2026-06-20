import { PriorityMatrix } from '../PriorityMatrix';
import { SIZE_ORDER, VALUE_MEDAL, VALUES } from '../../lib/constants';
import type { LocalParticipant, Size, Value, Vote } from '../../lib/types';

interface VoteResultsProps {
  name: string;
  votes: Vote[];
  selectedSize: Size | null;
  selectedValue: Value | null;
  localParticipant: LocalParticipant | null;
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
}: VoteResultsProps) {
  // Sorter stemmer etter størrelse
  const sortedVotes = [...votes].sort(
    (a, b) => SIZE_ORDER[a.size] - SIZE_ORDER[b.size],
  );

  // Konsensus-deteksjon
  const uniqueSizes = new Set(votes.map((v) => v.size));
  const hasConsensus = votes.length > 0 && uniqueSizes.size === 1;
  const consensusSize = hasConsensus ? [...uniqueSizes][0] : null;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'oklch(0.965 0.012 165)' }}
    >
      {/* Header */}
      <div className="px-4 py-5 text-center">
        <div className="text-4xl mb-1">🎊</div>
        <h2
          className="text-2xl font-bold"
          style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
        >
          Resultater!
        </h2>
      </div>

      <div className="flex-1 px-4 pb-8 space-y-4">
        {/* Konsensus-banner */}
        {hasConsensus && consensusSize && (
          <div
            className="rounded-2xl px-4 py-3 text-center animate-slideIn"
            style={{ background: 'oklch(0.30 0.08 165)', color: 'white' }}
          >
            <p
              className="text-base font-bold"
              style={{ fontFamily: 'Sora, sans-serif' }}
            >
              🎯 Konsensus — alle stemte {consensusSize.toUpperCase()}!
            </p>
          </div>
        )}

        {/* Stemmekort */}
        <div className="space-y-2">
          {sortedVotes.map((vote) => {
            const isMine = vote.participant_id === localParticipant?.participantId;
            return (
              <div
                key={vote.id}
                className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 animate-slideIn"
                style={{
                  boxShadow: isMine
                    ? '0 0 0 2px oklch(0.30 0.08 165), 0 2px 12px oklch(0.20 0.06 165 / 0.08)'
                    : '0 1px 8px oklch(0.20 0.06 165 / 0.06)',
                }}
              >
                <span className="text-2xl">{VALUE_MEDAL[vote.value]}</span>
                <span
                  className="flex-1 text-sm font-bold uppercase tracking-wide"
                  style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.30 0.08 165)' }}
                >
                  {vote.size.toUpperCase()}
                </span>
                {isMine && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: 'oklch(0.30 0.08 165)',
                      color: 'white',
                      fontFamily: 'DM Sans, sans-serif',
                    }}
                  >
                    Din
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Prioriteringsanbefaling */}
        {votes.length > 0 && (
          <PriorityMatrix votes={votes} />
        )}

        {/* Din stemme-reminder */}
        {selectedSize && selectedValue && (
          <div
            className="bg-white rounded-2xl px-4 py-3"
            style={{ boxShadow: '0 1px 8px oklch(0.20 0.06 165 / 0.06)' }}
          >
            <p
              className="text-xs mb-1"
              style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.55 0.04 165)' }}
            >
              Din stemme
            </p>
            <p
              className="text-sm font-semibold"
              style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
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
