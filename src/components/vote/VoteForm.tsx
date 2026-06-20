import { SIZES, VALUES } from '../../lib/constants';
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

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--color-neutral-100)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-4"
        style={{ borderBottom: '1px solid var(--color-neutral-200)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 transition-colors"
          style={{
            background: 'var(--color-neutral-100)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-neutral-700)',
          }}
          aria-label="Tilbake"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1
          className="text-lg font-semibold"
          style={{ color: 'var(--color-neutral-900)' }}
        >
          Deltager
        </h1>
        <span
          className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            background: 'var(--color-neutral-200)',
            color: 'var(--color-neutral-700)',
          }}
        >
          Runde {currentRound}
        </span>
      </div>

      {/* Skjema-kort */}
      <div className="flex-1 px-4 py-6 space-y-4">
        <div
          className="bg-white p-5 space-y-5 animate-fadeUp"
          style={{
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--color-neutral-200)',
          }}
        >
          <div className="text-center">
            <h2
              className="text-xl font-bold"
              style={{ color: 'var(--color-neutral-900)' }}
            >
              Din stemme
            </h2>
            <p
              className="text-sm mt-1"
              style={{ color: 'var(--color-neutral-500)' }}
            >
              Velg størrelse og verdi, og stem
            </p>
            {name && (
              <p
                className="text-xs mt-0.5"
                style={{ color: 'var(--color-neutral-500)' }}
              >
                Stemmer som: <strong>{name}</strong>
              </p>
            )}
          </div>

          {/* Størrelse */}
          <div>
            <p
              className="text-sm font-medium mb-2"
              style={{ color: 'var(--color-neutral-700)' }}
            >
              Størrelse
            </p>
            <div className="flex gap-2">
              {SIZES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectSize(key)}
                  disabled={submitting}
                  aria-pressed={selectedSize === key}
                  className="flex-1 py-3 font-bold text-sm transition-all focus:outline-none"
                  style={{
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${selectedSize === key ? 'transparent' : 'var(--color-neutral-200)'}`,
                    background: selectedSize === key ? 'var(--color-red-600)' : 'white',
                    color: selectedSize === key ? 'white' : 'var(--color-neutral-700)',
                    transform: selectedSize === key ? 'scale(1.04)' : 'scale(1)',
                    boxShadow: selectedSize === key
                      ? '0 6px 20px rgba(200,0,45,.30)'
                      : 'none',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Verdi */}
          <div>
            <p
              className="text-sm font-medium mb-2"
              style={{ color: 'var(--color-neutral-700)' }}
            >
              Forretningsverdi
            </p>
            <div className="flex gap-2">
              {VALUES.map(({ key, emoji, label, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectValue(key)}
                  disabled={submitting}
                  aria-pressed={selectedValue === key}
                  className="flex-1 flex flex-col items-center py-4 transition-all focus:outline-none"
                  style={{
                    minHeight: '100px',
                    borderRadius: '10px',
                    border: `2px solid ${selectedValue === key ? 'var(--color-red-600)' : 'var(--color-neutral-200)'}`,
                    background: 'white',
                    transform: selectedValue === key ? 'scale(1.04)' : 'scale(1)',
                    boxShadow: selectedValue === key
                      ? '0 2px 10px rgba(200,0,45,.20)'
                      : 'none',
                  }}
                >
                  <span className="text-2xl mb-1">{emoji}</span>
                  <span
                    className="text-xs font-bold"
                    style={{
                      color: selectedValue === key ? 'var(--color-red-600)' : 'var(--color-neutral-700)',
                    }}
                  >
                    {label}
                  </span>
                  <span
                    className="text-xs mt-0.5"
                    style={{
                      color: 'var(--color-neutral-500)',
                      opacity: 0.85,
                    }}
                  >
                    {desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Feilmelding */}
          {submitError && (
            <p
              className="text-sm text-center"
              style={{ color: 'var(--color-danger)' }}
            >
              {submitError}
            </p>
          )}

          {/* Stem-knapp */}
          <button
            type="button"
            onClick={onVote}
            disabled={!canVote || submitting}
            className="w-full py-4 font-bold text-white text-base transition-all focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{
              borderRadius: 'var(--radius-md)',
              background: canVote && !submitting
                ? 'var(--color-navy-900)'
                : 'var(--color-neutral-200)',
              color: canVote && !submitting ? 'white' : 'var(--color-neutral-400)',
              cursor: canVote && !submitting ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? 'Sender…' : 'Stem 🗳️'}
          </button>
        </div>
      </div>
    </div>
  );
}

export type { VoteFormProps };
