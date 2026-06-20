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
      style={{ background: 'oklch(0.965 0.012 165)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-4"
        style={{ borderBottom: '1px solid oklch(0.92 0.015 165)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
          style={{ background: 'oklch(0.92 0.015 165)', color: 'oklch(0.30 0.08 165)' }}
          aria-label="Tilbake"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1
          className="text-lg font-semibold"
          style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
        >
          Deltager
        </h1>
        <span
          className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            background: 'oklch(0.92 0.015 165)',
            color: 'oklch(0.40 0.06 165)',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          Runde {currentRound}
        </span>
      </div>

      {/* Skjema-kort */}
      <div className="flex-1 px-4 py-6 space-y-4">
        <div
          className="bg-white rounded-3xl p-5 space-y-5 animate-fadeUp"
          style={{ boxShadow: '0 2px 20px oklch(0.20 0.06 165 / 0.07)' }}
        >
          <div className="text-center">
            <h2
              className="text-xl font-bold"
              style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
            >
              Din stemme
            </h2>
            <p
              className="text-sm mt-1"
              style={{ color: 'oklch(0.55 0.04 165)', fontFamily: 'DM Sans, sans-serif' }}
            >
              Velg størrelse og verdi, og stem
            </p>
            {name && (
              <p
                className="text-xs mt-0.5"
                style={{ color: 'oklch(0.60 0.05 165)', fontFamily: 'DM Sans, sans-serif' }}
              >
                Stemmer som: <strong>{name}</strong>
              </p>
            )}
          </div>

          {/* Størrelse */}
          <div>
            <p
              className="text-sm font-medium mb-2"
              style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.35 0.05 165)' }}
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
                  className="flex-1 py-3 rounded-xl font-bold text-sm transition-all focus:outline-none"
                  style={{
                    fontFamily: 'Sora, sans-serif',
                    background: selectedSize === key
                      ? 'oklch(0.30 0.08 165)'
                      : 'oklch(0.94 0.015 165)',
                    color: selectedSize === key ? 'white' : 'oklch(0.35 0.05 165)',
                    transform: selectedSize === key ? 'scale(1.04)' : 'scale(1)',
                    boxShadow: selectedSize === key
                      ? '0 2px 10px oklch(0.30 0.08 165 / 0.35)'
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
              style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.35 0.05 165)' }}
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
                  className="flex-1 flex flex-col items-center py-4 rounded-2xl transition-all focus:outline-none"
                  style={{
                    minHeight: '100px',
                    background: selectedValue === key
                      ? 'oklch(0.30 0.08 165)'
                      : 'oklch(0.94 0.015 165)',
                    transform: selectedValue === key ? 'scale(1.04)' : 'scale(1)',
                    boxShadow: selectedValue === key
                      ? '0 2px 10px oklch(0.30 0.08 165 / 0.35)'
                      : 'none',
                  }}
                >
                  <span className="text-2xl mb-1">{emoji}</span>
                  <span
                    className="text-xs font-bold"
                    style={{
                      fontFamily: 'Sora, sans-serif',
                      color: selectedValue === key ? 'white' : 'oklch(0.30 0.08 165)',
                    }}
                  >
                    {label}
                  </span>
                  <span
                    className="text-xs mt-0.5"
                    style={{
                      fontFamily: 'DM Sans, sans-serif',
                      color: selectedValue === key ? 'white/80' : 'oklch(0.55 0.04 165)',
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
              style={{ color: 'oklch(0.52 0.18 25)', fontFamily: 'DM Sans, sans-serif' }}
            >
              {submitError}
            </p>
          )}

          {/* Stem-knapp */}
          <button
            type="button"
            onClick={onVote}
            disabled={!canVote || submitting}
            className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{
              fontFamily: 'Sora, sans-serif',
              background: canVote && !submitting
                ? 'oklch(0.56 0.17 35)'
                : 'oklch(0.80 0.03 165)',
              cursor: canVote && !submitting ? 'pointer' : 'not-allowed',
              opacity: canVote && !submitting ? 1 : 0.6,
              boxShadow: canVote && !submitting
                ? '0 2px 12px oklch(0.56 0.17 35 / 0.35)'
                : 'none',
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
