import { VALUE_MEDAL, VALUES } from '../../lib/constants';
import type { Size, Value } from '../../lib/types';

interface VoteAwaitRevealProps {
  name: string;
  selectedSize: Size;
  selectedValue: Value;
  currentRound?: number;
}

/**
 * State B – Venter på avsløring: deltaker har stemt, fasilitator avslører snart.
 * Navy-topp-mønster: #0B1D3A øverst, #F5F4F0 bunn.
 */
export function VoteAwaitReveal({ name, selectedSize, selectedValue, currentRound }: VoteAwaitRevealProps) {
  const myVoteEmoji = VALUE_MEDAL[selectedValue];
  const valueLabel = VALUES.find((v) => v.key === selectedValue)?.label ?? '';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F5F4F0' }}>
      {/* Navy topp-seksjon (~30%) */}
      <div
        style={{
          background: '#0B1D3A',
          borderRadius: '0 0 24px 24px',
          padding: '16px 24px 40px',
        }}
      >
        {/* Header-rad */}
        <div className="flex items-center mb-8">
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

        {/* Medalje + tittel + undertekst */}
        <div className="text-center">
          <div
            className="animate-popIn"
            style={{ fontSize: 56, lineHeight: 1, marginBottom: 16 }}
            aria-hidden="true"
          >
            {myVoteEmoji}
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>
            Stemme registrert!
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
            Venter på fasilitator, {name} 👋
          </p>
        </div>
      </div>

      {/* Varm-grå bunn */}
      <div className="flex-1 px-6 pt-8 space-y-5">
        {/* Oppsummerings-kort */}
        <div
          className="bg-white p-4 space-y-3"
          style={{
            borderRadius: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            border: '1px solid #E2E0DC',
          }}
        >
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: '#6B7280' }}>
              Størrelse
            </span>
            <span className="font-bold text-sm" style={{ color: '#0B1D3A' }}>
              {selectedSize.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: '#6B7280' }}>
              Verdi
            </span>
            <span className="text-sm">
              {myVoteEmoji}{' '}
              <span style={{ color: '#0B1D3A', fontWeight: 600 }}>
                {valueLabel}
              </span>
            </span>
          </div>
        </div>

        {/* Pulserende status-tekst */}
        <p
          className="text-center animate-pulse-slow"
          style={{ fontSize: 13, color: '#9E9B96' }}
        >
          • Venter på avsløring •
        </p>
      </div>
    </div>
  );
}

export type { VoteAwaitRevealProps };
