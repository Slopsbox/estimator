import type { Size, Value } from './types';

// ── Numeriske mapping-tabeller ──────────────────────────────

const SIZE_SCORE: Record<Size, number> = {
  xs: 1,
  s: 2,
  m: 3,
  l: 4,
  xl: 5,
};

const VALUE_SCORE: Record<Value, number> = {
  gold: 3,
  silver: 2,
  bronze: 1,
};

// Grenser som definerer kvadrant
const EFFORT_THRESHOLD = 2.5; // ≤ 2.5 = lav innsats (xs/s)
const VALUE_THRESHOLD = 2;    // > 2 = høy verdi (gold)

// ── Kvadrant-definisjoner ──────────────────────────────────

export type Quadrant = 'do-now' | 'plan' | 'quick-win' | 'avoid';

export interface MatrixResult {
  quadrant: Quadrant;
  avgEffort: number;
  avgValue: number;
  sizeLabel: string;
  valueLabel: string;
}

// ── Hjelpefunksjoner ───────────────────────────────────────

/** Beregn gjennomsnitt av tall-array. Returnerer null for tom liste. */
function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Konverter gjennomsnittlig innsatsscore til lesbar størrelseslabel (nærmeste verdi). */
function scoreToSizeLabel(score: number): string {
  if (score <= 1.5) return 'XS';
  if (score <= 2.5) return 'S';
  if (score <= 3.5) return 'M';
  if (score <= 4.5) return 'L';
  return 'XL';
}

/** Konverter gjennomsnittlig verdiscore til lesbar verdi-label (nærmeste verdi). */
function scoreToValueLabel(score: number): string {
  if (score >= 2.5) return '🥇 Gull';
  if (score >= 1.5) return '🥈 Sølv';
  return '🥉 Bronse';
}

/** Bestem kvadrant basert på gjennomsnitt. */
function determineQuadrant(avgEffort: number, avgValue: number): Quadrant {
  const isHighValue = avgValue > VALUE_THRESHOLD;
  const isLowEffort = avgEffort <= EFFORT_THRESHOLD;

  if (isHighValue && isLowEffort) return 'do-now';
  if (isHighValue && !isLowEffort) return 'plan';
  if (!isHighValue && isLowEffort) return 'quick-win';
  return 'avoid';
}

// ── Eksportert beregningsfunksjon (for testing) ─────────────

/** Beregn matrise fra stemmer. Aksepterer Vote[] fra DB (size/value er string i DB-typen). */
export function calculateMatrix(
  votes: Array<{ size: Size; value: Value }>,
): MatrixResult | null {
  if (votes.length === 0) return null;

  const effortScores = votes.map((v) => SIZE_SCORE[v.size]);
  const valueScores = votes.map((v) => VALUE_SCORE[v.value]);

  const avgEffort = average(effortScores)!;
  const avgValue = average(valueScores)!;

  return {
    quadrant: determineQuadrant(avgEffort, avgValue),
    avgEffort,
    avgValue,
    sizeLabel: scoreToSizeLabel(avgEffort),
    valueLabel: scoreToValueLabel(avgValue),
  };
}
