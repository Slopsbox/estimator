import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriorityMatrix, calculateMatrix } from '../../components/PriorityMatrix';
import type { Size, Value } from '../../lib/types';

// ── Hjelpere ────────────────────────────────────────────────

const vote = (size: Size, value: Value) => ({ size, value });

// ── calculateMatrix ─────────────────────────────────────────

describe('calculateMatrix', () => {
  it('returnerer null for tom stemmeliste', () => {
    expect(calculateMatrix([])).toBeNull();
  });

  it('"Gjør nå" – høy verdi + lav innsats (gold + xs)', () => {
    const result = calculateMatrix([vote('xs', 'gold')]);
    expect(result?.quadrant).toBe('do-now');
  });

  it('"Gjør nå" – grenseverdi: score xs=1, s=2, snitt=1.5 (lav), gold=3 (høy)', () => {
    const result = calculateMatrix([vote('xs', 'gold'), vote('s', 'gold')]);
    // avgEffort = (1+2)/2 = 1.5 ≤ 2.5, avgValue = 3 > 2 → do-now
    expect(result?.quadrant).toBe('do-now');
  });

  it('"Planlegg" – høy verdi + høy innsats (gold + xl)', () => {
    const result = calculateMatrix([vote('xl', 'gold')]);
    expect(result?.quadrant).toBe('plan');
  });

  it('"Planlegg" – grenseverdi: m=3 (høy innsats), gold=3 (høy verdi)', () => {
    const result = calculateMatrix([vote('m', 'gold')]);
    // avgEffort = 3 > 2.5, avgValue = 3 > 2 → plan
    expect(result?.quadrant).toBe('plan');
  });

  it('"Gjør raskt" – lav verdi + lav innsats (bronze + xs)', () => {
    const result = calculateMatrix([vote('xs', 'bronze')]);
    expect(result?.quadrant).toBe('quick-win');
  });

  it('"Gjør raskt" – silver + s (avgValue=2 ≤ 2, avgEffort=2 ≤ 2.5)', () => {
    const result = calculateMatrix([vote('s', 'silver')]);
    // silver=2, threshold=2, 2 > 2 = false → lav verdi; effort=2 ≤ 2.5 → quick-win
    expect(result?.quadrant).toBe('quick-win');
  });

  it('"Unngå" – lav verdi + høy innsats (bronze + xl)', () => {
    const result = calculateMatrix([vote('xl', 'bronze')]);
    expect(result?.quadrant).toBe('avoid');
  });

  it('beregner gjennomsnitt korrekt for flere stemmer', () => {
    // xs(1) + xl(5) = snitt 3; gold(3) + bronze(1) = snitt 2
    const result = calculateMatrix([vote('xs', 'gold'), vote('xl', 'bronze')]);
    expect(result?.avgEffort).toBe(3);
    expect(result?.avgValue).toBe(2);
    // avgValue=2, 2 > 2 = false → lav verdi; avgEffort=3 > 2.5 → høy innsats → avoid
    expect(result?.quadrant).toBe('avoid');
  });

  it('størrelseslabel beregnes korrekt', () => {
    expect(calculateMatrix([vote('xs', 'gold')])?.sizeLabel).toBe('XS');  // score 1 ≤ 1.5
    expect(calculateMatrix([vote('s', 'gold')])?.sizeLabel).toBe('S');    // score 2 ≤ 2.5
    expect(calculateMatrix([vote('m', 'gold')])?.sizeLabel).toBe('M');    // score 3 ≤ 3.5
    expect(calculateMatrix([vote('l', 'gold')])?.sizeLabel).toBe('L');    // score 4 ≤ 4.5
    expect(calculateMatrix([vote('xl', 'gold')])?.sizeLabel).toBe('XL'); // score 5 > 4.5
  });

  it('verdi-label beregnes korrekt', () => {
    expect(calculateMatrix([vote('xs', 'gold')])?.valueLabel).toBe('🥇 Gull');    // 3 ≥ 2.5
    expect(calculateMatrix([vote('xs', 'silver')])?.valueLabel).toBe('🥈 Sølv'); // 2 ≥ 1.5
    expect(calculateMatrix([vote('xs', 'bronze')])?.valueLabel).toBe('🥉 Bronse'); // 1 < 1.5
  });

  it('håndterer mange like stemmer', () => {
    const votes = Array.from({ length: 10 }, () => vote('m', 'gold'));
    const result = calculateMatrix(votes);
    expect(result?.avgEffort).toBe(3);
    expect(result?.avgValue).toBe(3);
    expect(result?.quadrant).toBe('plan'); // m(3) > 2.5 → høy innsats
  });

  it('grenseverdi innsats: snitt nøyaktig 2.5 = lav innsats (≤)', () => {
    // s=2, m=3 → snitt 2.5 → ≤ 2.5 → lav innsats
    const result = calculateMatrix([vote('s', 'gold'), vote('m', 'gold')]);
    expect(result?.avgEffort).toBe(2.5);
    expect(result?.quadrant).toBe('do-now'); // gold(3) > 2 → høy verdi; 2.5 ≤ 2.5 → lav innsats
  });
});

// ── PriorityMatrix-komponent ─────────────────────────────────

describe('PriorityMatrix', () => {
  it('viser ingenting for tom stemmeliste', () => {
    const { container } = render(<PriorityMatrix votes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('viser "Gjør nå" for høy verdi + lav innsats', () => {
    render(<PriorityMatrix votes={[vote('xs', 'gold')]} />);
    expect(screen.getByText('⭐ Gjør nå')).toBeInTheDocument();
    expect(screen.getByText('Høy verdi, lav innsats')).toBeInTheDocument();
  });

  it('viser "Planlegg" for høy verdi + høy innsats', () => {
    render(<PriorityMatrix votes={[vote('xl', 'gold')]} />);
    expect(screen.getByText('📋 Planlegg')).toBeInTheDocument();
    expect(screen.getByText('Høy verdi, høy innsats')).toBeInTheDocument();
  });

  it('viser "Gjør raskt" for lav verdi + lav innsats', () => {
    render(<PriorityMatrix votes={[vote('xs', 'bronze')]} />);
    expect(screen.getByText('⚡ Gjør raskt')).toBeInTheDocument();
    expect(screen.getByText('Lav verdi, lav innsats')).toBeInTheDocument();
  });

  it('viser "Unngå" for lav verdi + høy innsats', () => {
    render(<PriorityMatrix votes={[vote('xl', 'bronze')]} />);
    expect(screen.getByText('❌ Unngå')).toBeInTheDocument();
    expect(screen.getByText('Lav verdi, høy innsats')).toBeInTheDocument();
  });

  it('viser gjennomsnitt-badge med størrelse og verdi', () => {
    render(<PriorityMatrix votes={[vote('xs', 'gold')]} />);
    // XS størrelse, Gull verdi
    expect(screen.getByText(/Snitt:.*XS.*størrelse.*Gull/)).toBeInTheDocument();
  });

  it('har role=region og aria-label for tilgjengelighet', () => {
    render(<PriorityMatrix votes={[vote('m', 'gold')]} />);
    expect(screen.getByRole('region', { name: /prioriteringsanbefaling/i })).toBeInTheDocument();
  });

  it('viser snitt-badge korrekt for blandede stemmer', () => {
    // xs(1)+xl(5) = snitt 3 = M; gold(3)+bronze(1) = snitt 2 = Sølv
    render(<PriorityMatrix votes={[vote('xs', 'gold'), vote('xl', 'bronze')]} />);
    expect(screen.getByText(/Snitt:.*M.*størrelse.*Sølv/)).toBeInTheDocument();
  });
});
