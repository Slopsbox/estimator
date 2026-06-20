import { VALUE_MEDAL, VALUES } from '../../lib/constants';
import type { Size, Value } from '../../lib/types';

interface VoteAwaitRevealProps {
  name: string;
  selectedSize: Size;
  selectedValue: Value;
}

/**
 * State B – Venter på avsløring: deltaker har stemt, fasilitator avslører snart.
 */
export function VoteAwaitReveal({ name, selectedSize, selectedValue }: VoteAwaitRevealProps) {
  const myVoteEmoji = VALUE_MEDAL[selectedValue];
  const valueLabel = VALUES.find((v) => v.key === selectedValue)?.label ?? '';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-10"
      style={{ background: 'oklch(0.965 0.012 165)' }}
    >
      <div className="w-full max-w-sm text-center space-y-5">
        {/* Stor medalje */}
        <div className="text-7xl animate-popIn">{myVoteEmoji}</div>

        <div>
          <h2
            className="text-2xl font-bold"
            style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}
          >
            Stemme registrert!
          </h2>
          <p
            className="mt-2 text-base"
            style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.45 0.05 165)' }}
          >
            Venter på fasilitator, {name} 👋
          </p>
        </div>

        {/* Oppsummering */}
        <div
          className="bg-white rounded-2xl p-4 space-y-2"
          style={{ boxShadow: '0 2px 16px oklch(0.20 0.06 165 / 0.07)' }}
        >
          <div className="flex justify-between items-center">
            <span
              className="text-sm"
              style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.50 0.04 165)' }}
            >
              Størrelse
            </span>
            <span
              className="font-bold text-sm uppercase"
              style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.30 0.08 165)' }}
            >
              {selectedSize.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span
              className="text-sm"
              style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.50 0.04 165)' }}
            >
              Verdi
            </span>
            <span className="text-sm">
              {myVoteEmoji}{' '}
              <span style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.30 0.08 165)', fontWeight: 600 }}>
                {valueLabel}
              </span>
            </span>
          </div>
        </div>

        {/* Puls-animasjon */}
        <p
          className="text-sm animate-pulse-slow"
          style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.55 0.04 165)' }}
        >
          • Venter på avsløring •
        </p>
      </div>
    </div>
  );
}

export type { VoteAwaitRevealProps };
