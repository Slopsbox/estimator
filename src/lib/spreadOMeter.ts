import { SIZE_ORDER } from './constants';
import type { Size } from './types';

// ── Tilstands-definisjoner ──────────────────────────────────

export type SeaState = 'calm' | 'ripples' | 'choppy' | 'storm' | 'hurricane';

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
