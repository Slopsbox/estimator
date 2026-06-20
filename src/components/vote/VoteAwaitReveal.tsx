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
      style={{ background: 'var(--color-neutral-100)' }}
    >
      <div className="w-full max-w-sm text-center space-y-5">
        {/* Stor medalje */}
        <div className="text-7xl animate-popIn">{myVoteEmoji}</div>

        <div>
          <h2
            className="text-2xl font-bold"
            style={{ color: 'var(--color-neutral-900)' }}
          >
            Stemme registrert!
          </h2>
          <p
            className="mt-2 text-base"
            style={{ color: 'var(--color-neutral-500)' }}
          >
            Venter på fasilitator, {name} 👋
          </p>
        </div>

        {/* Oppsummering */}
        <div
          className="bg-white p-4 space-y-2"
          style={{
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="flex justify-between items-center">
            <span
              className="text-sm"
              style={{ color: 'var(--color-neutral-500)' }}
            >
              Størrelse
            </span>
            <span
              className="font-bold text-sm uppercase"
              style={{ color: 'var(--color-neutral-900)' }}
            >
              {selectedSize.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span
              className="text-sm"
              style={{ color: 'var(--color-neutral-500)' }}
            >
              Verdi
            </span>
            <span className="text-sm">
              {myVoteEmoji}{' '}
              <span style={{ color: 'var(--color-neutral-900)', fontWeight: 600 }}>
                {valueLabel}
              </span>
            </span>
          </div>
        </div>

        {/* Puls-animasjon */}
        <p
          className="text-sm animate-pulse-slow"
          style={{ color: 'var(--color-neutral-400)' }}
        >
          • Venter på avsløring •
        </p>
      </div>
    </div>
  );
}

export type { VoteAwaitRevealProps };
