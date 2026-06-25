import { calculateMatrix } from '../lib/priorityMatrix';
import type { MatrixResult } from '../lib/priorityMatrix';
import type { Size, Value, Vote } from '../lib/types';

// ── Kvadrant-definisjoner ──────────────────────────────────

type Quadrant = MatrixResult['quadrant'];

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
    background: '#E8F4ED',
    textColor: '#1A1917',
    badgeBackground: '#C6E6D4',
  },
  plan: {
    label: '📋 Planlegg',
    description: 'Høy verdi, høy innsats',
    background: '#FFF4E0',
    textColor: '#3D3B38',
    badgeBackground: '#FFE4A8',
  },
  'quick-win': {
    label: '⚡ Gjør raskt',
    description: 'Lav verdi, lav innsats',
    background: '#E8EEF8',
    textColor: '#3D3B38',
    badgeBackground: '#C8D8EE',
  },
  avoid: {
    label: '❌ Unngå',
    description: 'Lav verdi, høy innsats',
    background: '#FFE5EA',
    textColor: '#3D3B38',
    badgeBackground: '#FFC2CB',
  },
};

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
        style={{ color: config.textColor }}
      >
        {config.label}
      </p>

      {/* Forklaring */}
      <p
        className="text-sm text-center"
        style={{ color: config.textColor, opacity: 0.8 }}
      >
        {config.description}
      </p>

      {/* Gjennomsnitt-badge */}
      <div className="flex justify-center pt-1">
        <span
          className="text-xs font-medium px-3 py-1 rounded-full"
          style={{
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
