import { SIZE_ORDER } from '../lib/constants';
import type { Size } from '../lib/types';

// ── Tilstands-definisjoner ──────────────────────────────────

export type SeaState = 'calm' | 'ripples' | 'choppy' | 'storm' | 'hurricane';

interface SeaStateConfig {
  emoji: string;
  text: string;
  background: string;
  border?: string;
  animate: boolean;
}

const SEA_STATE_CONFIG: Record<SeaState, SeaStateConfig> = {
  calm: {
    emoji: '🏖️',
    text: 'Stille hav — alle på samme bølgelengde',
    background: '#E8F4ED',
    animate: false,
  },
  ripples: {
    emoji: '🌊',
    text: 'Litt bølger — nesten enige',
    background: '#E8EEF8',
    animate: true,
  },
  choppy: {
    emoji: '🌊💨',
    text: 'Urolig sjø — noe spredning i teamet',
    background: '#FFF4E0',
    animate: true,
  },
  storm: {
    emoji: '⛈️',
    text: 'Storm! — stor uenighet, diskuter?',
    background: '#FFE5EA',
    animate: true,
  },
  hurricane: {
    emoji: '🌪️',
    text: 'Orkan! — alle er på forskjellige planeter',
    background: '#FFE5EA',
    border: '2px solid var(--color-danger)',
    animate: true,
  },
};

// ── Eksporterte hjelpefunksjoner (for testing) ──────────────

/** Beregn range (max - min) i SIZE_ORDER-enheter fra en stemmeliste. */
export function calculateRange(votes: Array<{ size: string }>): number {
  if (votes.length === 0) return 0;
  const indices = votes.map((v) => SIZE_ORDER[v.size as Size] ?? 0);
  return Math.max(...indices) - Math.min(...indices);
}

/** Bestem havtilstand basert på range. */
export function rangeToSeaState(range: number): SeaState {
  if (range === 0) return 'calm';
  if (range === 1) return 'ripples';
  if (range <= 3) return range === 2 ? 'choppy' : 'storm';
  return 'hurricane';
}

// ── Komponent ──────────────────────────────────────────────

export interface SpreadOMeterProps {
  votes: Array<{ size: string }>;
}

/**
 * Havtilstand Spread-o-meter.
 * Viser teamets "havtilstand" basert på spredningen i stemmene etter reveal.
 */
export function SpreadOMeter({ votes }: SpreadOMeterProps) {
  if (votes.length === 0) return null;

  const range = calculateRange(votes);
  // Når det er konsensus (range === 0) er "Stille hav" meldingen
  // redundant med konsensus-banneret. Skjul komponenten helt.
  if (range === 0) return null;

  const state = rangeToSeaState(range);
  const config = SEA_STATE_CONFIG[state];

  return (
    <div
      className="flex items-center gap-4 px-5 py-4 animate-slideIn"
      style={{
        background: config.background,
        borderRadius: 'var(--radius-lg)',
        border: config.border ?? '1.5px solid transparent',
      }}
      role="region"
      aria-label="Havtilstand"
    >
      <span
        className="text-3xl flex-shrink-0 select-none"
        style={
          config.animate
            ? { display: 'inline-block', animation: 'wave 1.5s ease-in-out infinite' }
            : undefined
        }
        aria-hidden="true"
      >
        {config.emoji}
      </span>
      <p
        className="text-sm font-medium"
        style={{ color: 'var(--color-neutral-800)' }}
      >
        {config.text}
      </p>
    </div>
  );
}
