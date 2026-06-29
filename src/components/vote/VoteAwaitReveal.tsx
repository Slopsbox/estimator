import { VALUE_MEDAL, VALUES } from '../../lib/constants';
import { NavyPageLayout } from '../NavyPageLayout';
import type { Size, Value } from '../../lib/types';

interface VoteAwaitRevealProps {
  name: string;
  selectedSize: Size;
  selectedValue: Value;
  currentRound?: number;
  hasUsedAmalie?: boolean;
  onAmalie?: () => void;
}

/**
 * State B – Venter på avsløring: deltaker har stemt, fasilitator avslører snart.
 * Navy-topp-mønster: #0B1D3A øverst, #F5F4F0 bunn.
 *
 * Amalieknappen: lar deltakere re-estimere én gang per runde (FØR avsløring).
 * Vises kun når hasUsedAmalie=false. Skjules automatisk etter bruk.
 */
export function VoteAwaitReveal({
  name,
  selectedSize,
  selectedValue,
  currentRound,
  hasUsedAmalie = false,
  onAmalie,
}: VoteAwaitRevealProps) {
  const myVoteEmoji = VALUE_MEDAL[selectedValue];
  const valueLabel = VALUES.find((v) => v.key === selectedValue)?.label ?? '';

  const roundBadge = currentRound !== undefined ? (
    <span
      className="text-xs font-medium px-3 py-1 rounded-full"
      style={{
        background: 'rgba(255,255,255,0.1)',
        color: '#A0BADE',
      }}
    >
      Runde {currentRound}
    </span>
  ) : undefined;

  return (
    <NavyPageLayout
      roleLabel="Deltager"
      headerRight={roundBadge}
      navyContent={
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
      }
    >
      <div className="space-y-5">
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

        {/* Amalieknappen – vises kun én gang per runde, kun FØR avsløring */}
        {!hasUsedAmalie && onAmalie && (
          <div className="text-center">
            <button
              type="button"
              onClick={onAmalie}
              aria-label="Amalieknappen – endre stemmen din (1 gang per runde)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                border: '1.5px solid var(--color-neutral-200, #E2E0DC)',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'transparent',
                color: 'var(--color-neutral-500, #6B7280)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = '#F5F4F0';
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#9E9B96';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-neutral-200, #E2E0DC)';
              }}
            >
              ↩️ Amalieknappen
            </button>
            <p
              style={{ fontSize: 12, color: '#9E9B96', marginTop: 4 }}
            >
              Endre stemmen din (1 gang per runde)
            </p>
          </div>
        )}

        {/* Pulserende status-tekst */}
        <p
          className="text-center animate-pulse-slow"
          style={{ fontSize: 13, color: '#9E9B96' }}
        >
          • Venter på avsløring •
        </p>
      </div>
    </NavyPageLayout>
  );
}

export type { VoteAwaitRevealProps };
