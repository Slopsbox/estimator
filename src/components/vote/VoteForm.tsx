import { SIZES, VALUES } from '../../lib/constants';
import { NavyPageLayout } from '../NavyPageLayout';
import type { Size, Value } from '../../lib/types';

interface VoteFormProps {
  name: string;
  currentRound: number;
  selectedSize: Size | null;
  selectedValue: Value | null;
  submitting: boolean;
  submitError: string | null;
  onSelectSize: (size: Size) => void;
  onSelectValue: (value: Value) => void;
  onVote: () => void;
  onBack: () => void;
}

/**
 * State A – Stemmeform: deltaker velger størrelse og verdi.
 * Navy-topp-mønster (matching DeltagerJoin/fasilitator).
 */
export function VoteForm({
  name,
  currentRound,
  selectedSize,
  selectedValue,
  submitting,
  submitError,
  onSelectSize,
  onSelectValue,
  onVote,
  onBack,
}: VoteFormProps) {
  const canVote = selectedSize !== null && selectedValue !== null;

  const roundBadge = (
    <span
      className="text-xs font-medium px-3 py-1 rounded-full"
      style={{
        background: 'rgba(255,255,255,0.1)',
        color: '#A0BADE',
      }}
    >
      Runde {currentRound}
    </span>
  );

  return (
    <NavyPageLayout
      roleLabel="Deltager"
      onBack={onBack}
      headerRight={roundBadge}
      navyContent={
        <div className="text-center">
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>
            Din stemme
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
            Velg størrelse og verdi
          </p>
          {name && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
              Stemmer som: {name}
            </p>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {/* Størrelse */}
        <div>
          <p
            className="mb-2"
            style={{ fontSize: 14, fontWeight: 500, color: '#0B1D3A' }}
          >
            Størrelse
          </p>
          <div className="flex gap-2">
            {SIZES.map(({ key, label }) => {
              const isSelected = selectedSize === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectSize(key)}
                  disabled={submitting}
                  aria-pressed={isSelected}
                  className="flex-1 py-3 font-bold text-sm transition-all focus:outline-none"
                  style={{
                    borderRadius: 8,
                    border: `1.5px solid ${isSelected ? 'transparent' : '#E2E0DC'}`,
                    background: isSelected ? '#C8002D' : '#fff',
                    color: isSelected ? '#fff' : '#0B1D3A',
                    boxShadow: isSelected
                      ? '0 4px 12px rgba(200,0,45,.25)'
                      : 'none',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Verdi */}
        <div>
          <p
            className="mb-2"
            style={{ fontSize: 14, fontWeight: 500, color: '#0B1D3A' }}
          >
            Verdi
          </p>
          <div className="flex gap-2">
            {VALUES.map(({ key, emoji, label, desc }) => {
              const isSelected = selectedValue === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectValue(key)}
                  disabled={submitting}
                  aria-pressed={isSelected}
                  className="flex-1 flex flex-col items-center py-4 transition-all focus:outline-none"
                  style={{
                    minHeight: 100,
                    borderRadius: 12,
                    border: `1.5px solid ${isSelected ? '#C8002D' : '#E2E0DC'}`,
                    background: isSelected ? '#FFE5EA' : '#fff',
                    boxShadow: isSelected
                      ? '0 2px 10px rgba(200,0,45,.20)'
                      : 'none',
                  }}
                >
                  <span className="text-2xl mb-1">{emoji}</span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: isSelected ? '#C8002D' : '#0B1D3A' }}
                  >
                    {label}
                  </span>
                  <span
                    className="text-xs mt-0.5"
                    style={{ color: '#6B7280' }}
                  >
                    {desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Feilmelding */}
        {submitError && (
          <p style={{ fontSize: 13, color: '#C8002D', textAlign: 'center' }}>
            {submitError}
          </p>
        )}

        {/* Stem-knapp */}
        <button
          type="button"
          onClick={onVote}
          disabled={!canVote || submitting}
          className="w-full font-bold text-white text-base transition-all focus:outline-none"
          style={{
            height: 52,
            borderRadius: 12,
            background: '#C8002D',
            opacity: canVote && !submitting ? 1 : 0.4,
            cursor: canVote && !submitting ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting ? 'Sender…' : 'Stem 🗳️'}
        </button>
      </div>
    </NavyPageLayout>
  );
}

export type { VoteFormProps };
