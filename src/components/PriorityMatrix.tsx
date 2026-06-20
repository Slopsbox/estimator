import type { Size, Value, Vote } from '../lib/types';

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

type Quadrant = 'do-now' | 'plan' | 'quick-win' | 'avoid';

interface QuadrantConfig {
  label: string;
  description: string;
  background: string;
  textColor: string;
  badgeBackground: string;
}

const QUADRANT_CONFIG: Record<Quadrant, QuadrantConfig> = {
  'do-now': {
    label: '⭐ Gjør nå',
    description: 'Høy verdi, lav innsats',
    background: 'oklch(0.92 0.08 165)',
    textColor: 'oklch(0.18 0.09 165)',
    badgeBackground: 'oklch(0.82 0.10 165)',
  },
  plan: {
    label: '📋 Planlegg',
    description: 'Høy verdi, høy innsats',
    background: 'oklch(0.94 0.08 85)',
    textColor: 'oklch(0.22 0.08 85)',
    badgeBackground: 'oklch(0.86 0.10 85)',
  },
  'quick-win': {
    label: '⚡ Gjør raskt',
    description: 'Lav verdi, lav innsats',
    background: 'oklch(0.94 0.06 85)',
    textColor: 'oklch(0.28 0.07 85)',
    badgeBackground: 'oklch(0.86 0.08 85)',
  },
  avoid: {
    label: '❌ Unngå',
    description: 'Lav verdi, høy innsats',
    background: 'oklch(0.94 0.08 25)',
    textColor: 'oklch(0.30 0.12 25)',
    badgeBackground: 'oklch(0.86 0.10 25)',
  },
};

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

export interface MatrixResult {
  quadrant: Quadrant;
  avgEffort: number;
  avgValue: number;
  sizeLabel: string;
  valueLabel: string;
}

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

// ── Komponent ──────────────────────────────────────────────

export interface PriorityMatrixProps {
  /**
   * Stemmer fra DB. size/value er string i DB-typen, men CHECK-constraints
   * garanterer at de alltid er gyldige Size/Value-verdier.
   */
  votes: Vote[] | Array<{ size: Size; value: Value }>;
}

/**
 * Verdi/Innsats-matrise-kort.
 * Beregner gjennomsnittlig innsats og verdi fra alle stemmer,
 * og viser en prioriteringsanbefaling i riktig kvadrant.
 */
export function PriorityMatrix({ votes }: PriorityMatrixProps) {
  // Cast til narrowed type – DB CHECK-constraints garanterer gyldige verdier
  const result = calculateMatrix(votes as Array<{ size: Size; value: Value }>);

  if (!result) return null;

  const config = QUADRANT_CONFIG[result.quadrant];

  return (
    <div
      className="rounded-2xl px-5 py-4 space-y-2 animate-slideIn"
      style={{ background: config.background }}
      role="region"
      aria-label="Prioriteringsanbefaling"
    >
      {/* Anbefaling */}
      <p
        className="text-xl font-extrabold text-center"
        style={{ fontFamily: 'Sora, sans-serif', color: config.textColor }}
      >
        {config.label}
      </p>

      {/* Forklaring */}
      <p
        className="text-sm text-center"
        style={{ fontFamily: 'DM Sans, sans-serif', color: config.textColor, opacity: 0.8 }}
      >
        {config.description}
      </p>

      {/* Gjennomsnitt-badge */}
      <div className="flex justify-center pt-1">
        <span
          className="text-xs font-medium px-3 py-1 rounded-full"
          style={{
            fontFamily: 'DM Sans, sans-serif',
            background: config.badgeBackground,
            color: config.textColor,
          }}
        >
          Snitt: {result.sizeLabel} størrelse · {result.valueLabel}
        </span>
      </div>
    </div>
  );
}
