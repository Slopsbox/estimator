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
  currentRound?: number;
}

/** Returner riktig antall flamme-emojier for streaken. */
function streakFlames(streak: number): string {
  if (streak >= 6) return '🔥🔥🔥';
  if (streak >= 4) return '🔥🔥';
  return '🔥';
}

/**
 * State C – Resultater: stemmer avslørt, vis resultatoversikt med konfetti.
 * Navy-topp-mønster: #0B1D3A øverst (~25%), #F5F4F0 bunn (scrollbar).
 */
export function VoteResults({
  name: _name,
  votes,
  selectedSize,
  selectedValue,
  localParticipant,
  consensusStreak,
  currentRound,
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
    <div className="min-h-screen flex flex-col" style={{ background: '#F5F4F0' }}>
      {/* Navy topp-seksjon (~25%) */}
      <div
        style={{
          background: '#0B1D3A',
          borderRadius: '0 0 24px 24px',
          padding: '16px 24px 36px',
        }}
      >
        {/* Header-rad */}
        <div className="flex items-center mb-6">
          {/* Spacer venstre for symmetri */}
          <div className="w-9" />
          <span
            className="flex-1 text-center font-medium"
            style={{ fontSize: 16, color: 'white' }}
          >
            Deltager
          </span>
          {/* Runde-badge høyre */}
          {currentRound !== undefined && (
            <span
              className="text-xs font-medium px-3 py-1 rounded-full"
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#A0BADE',
              }}
            >
              Runde {currentRound}
            </span>
          )}
          {currentRound === undefined && <div className="w-9" />}
        </div>

        {/* Konfetti-emoji + tittel + undertekst */}
        <div className="text-center">
          <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 12 }} aria-hidden="true">
            🎊
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0 }}>
            Resultater!
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
            {votes.length} stemme{votes.length !== 1 ? 'r' : ''} avlagt
          </p>
        </div>
      </div>

      {/* Varm-grå bunn (scrollbar) */}
      <div className="flex-1 px-4 pt-6 pb-8 space-y-4">
        {/* Konsensus-banner */}
        {hasConsensus && consensusSize && (
          <div
            className="px-4 py-3 text-center animate-slideIn"
            style={{
              background: '#1A7A4A',
              borderRadius: 12,
              color: 'white',
            }}
          >
            <p className="text-base font-bold">
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
                    ? '1.5px solid #C8002D'
                    : '1.5px solid #E2E0DC',
                  borderRadius: '10px',
                  boxShadow: isMine ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <span className="text-2xl">{VALUE_MEDAL[vote.value as Value]}</span>
                <span
                  className="flex-1 text-sm font-bold uppercase tracking-wide"
                  style={{ color: '#0B1D3A' }}
                >
                  {vote.size.toUpperCase()}
                </span>
                {isMine && (
                  <span
                    className="text-xs px-2 py-0.5 font-medium"
                    style={{
                      background: '#C8002D',
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
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            <p
              className="text-xs mb-1"
              style={{ color: '#6B7280' }}
            >
              Din stemme
            </p>
            <p
              className="text-sm font-semibold"
              style={{ color: '#0B1D3A' }}
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
