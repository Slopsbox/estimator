import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriorityMatrix } from '../../components/PriorityMatrix';
import { calculateMatrix } from '../../lib/priorityMatrix';
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
    // avgEffort = (1+2)/2 = 1.5 ≤ 2.5, avgValue = 3 ≥ 2.5 → do-now
    expect(result?.quadrant).toBe('do-now');
  });

  it('"Planlegg" – høy verdi + høy innsats (gold + xl)', () => {
    const result = calculateMatrix([vote('xl', 'gold')]);
    expect(result?.quadrant).toBe('plan');
  });

  it('"Planlegg" – grenseverdi: m=3 (høy innsats), gold=3 (høy verdi)', () => {
    const result = calculateMatrix([vote('m', 'gold')]);
    // avgEffort = 3 > 2.5, avgValue = 3 ≥ 2.5 → plan
    expect(result?.quadrant).toBe('plan');
  });

  it('"Gjør raskt" – lav verdi + lav innsats (bronze + xs)', () => {
    const result = calculateMatrix([vote('xs', 'bronze')]);
    expect(result?.quadrant).toBe('quick-win');
  });

  it('"Gjør raskt" – silver + s (middels verdi og lav innsats)', () => {
    const result = calculateMatrix([vote('s', 'silver')]);
    // Sølv er middels verdi, men lav innsats gjør dette fortsatt til en quick win.
    expect(result?.quadrant).toBe('quick-win');
  });

  it('behandler et Sølv-lignende verdisnitt som middels verdi', () => {
    const result = calculateMatrix([
      vote('m', 'silver'),
      vote('m', 'silver'),
      vote('m', 'gold'),
    ]);
    expect(result?.avgValue).toBeCloseTo(2.33, 2);
    expect(result?.valueLabel).toBe('🥈 Sølv');
    expect(result?.quadrant).toBe('discuss');
  });

  it('"Unngå" – lav verdi + høy innsats (bronze + xl)', () => {
    const result = calculateMatrix([vote('xl', 'bronze')]);
    expect(result?.quadrant).toBe('avoid');
  });

  it.each<Size>(['m', 'l', 'xl'])(
    '"Diskuter" – middels verdi og %s innsats',
    (size) => {
      const result = calculateMatrix([vote(size, 'silver')]);
      expect(result?.quadrant).toBe('discuss');
    },
  );

  it('beregner gjennomsnitt korrekt for flere stemmer', () => {
    // xs(1) + xl(5) = snitt 3; gold(3) + bronze(1) = snitt 2
    const result = calculateMatrix([vote('xs', 'gold'), vote('xl', 'bronze')]);
    expect(result?.avgEffort).toBe(3);
    expect(result?.avgValue).toBe(2);
    // Snittet er M + Sølv og skal derfor diskuteres, ikke unngås.
    expect(result?.quadrant).toBe('discuss');
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
    expect(result?.quadrant).toBe('do-now'); // gold(3) ≥ 2.5 → høy verdi; 2.5 ≤ 2.5 → lav innsats
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
    render(<PriorityMatrix votes={[vote('l', 'gold')]} />);
    expect(screen.getByText('📋 Planlegg')).toBeInTheDocument();
    expect(screen.getByText('Høy verdi, høy innsats')).toBeInTheDocument();
  });

  it('viser "Gjør raskt" for lav verdi + lav innsats', () => {
    render(<PriorityMatrix votes={[vote('xs', 'bronze')]} />);
    expect(screen.getByText('⚡ Gjør raskt')).toBeInTheDocument();
    expect(screen.getByText('Lav verdi, lav innsats')).toBeInTheDocument();
  });

  it('omtaler Sølv som middels verdi ved lav innsats', () => {
    render(<PriorityMatrix votes={[vote('s', 'silver')]} />);
    expect(screen.getByText('Middels verdi, lav innsats')).toBeInTheDocument();
  });

  it('viser "Unngå" for lav verdi + høy innsats', () => {
    render(<PriorityMatrix votes={[vote('l', 'bronze')]} />);
    expect(screen.getByText('❌ Unngå')).toBeInTheDocument();
    expect(screen.getByText('Lav verdi, høy innsats')).toBeInTheDocument();
  });

  it('viser "Verdt en prat" for M + Sølv', () => {
    render(<PriorityMatrix votes={[vote('m', 'silver')]} />);
    expect(screen.getByText('💬 Verdt en prat')).toBeInTheDocument();
    expect(
      screen.getByText('Middels verdi og potensielt stor innsats. Bør diskuteres.'),
    ).toBeInTheDocument();
  });

  it('anbefaler oppdeling for XL + Sølv', () => {
    render(<PriorityMatrix votes={[vote('xl', 'silver')]} />);
    expect(
      screen.getByText('Svært stor innsats med middels verdi. Diskuter og vurder å dele opp.'),
    ).toBeInTheDocument();
  });

  it.each([
    ['gold', 'Høy verdi og svært stor innsats. Planlegg og vurder å dele opp.'],
    ['bronze', 'Lav verdi og svært stor innsats. Unngå eller vurder å dele opp.'],
  ] as const)('anbefaler oppdeling for XL + %s', (value, description) => {
    render(<PriorityMatrix votes={[vote('xl', value)]} />);
    expect(screen.getByText(description)).toBeInTheDocument();
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
