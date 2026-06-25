import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpreadOMeter } from '../../components/SpreadOMeter';
import { calculateRange, rangeToSeaState } from '../../lib/spreadOMeter';
import type { Size } from '../../lib/types';

// ── Hjelpere ────────────────────────────────────────────────

const vote = (size: Size) => ({ size });

// ── calculateRange ──────────────────────────────────────────

describe('calculateRange', () => {
  it('returnerer 0 for tom stemmeliste', () => {
    expect(calculateRange([])).toBe(0);
  });

  it('returnerer 0 for én stemme', () => {
    expect(calculateRange([vote('m')])).toBe(0);
  });

  it('returnerer 0 for konsensus (alle xs)', () => {
    expect(calculateRange([vote('xs'), vote('xs'), vote('xs')])).toBe(0);
  });

  it('beregner range 1 korrekt (s til m)', () => {
    expect(calculateRange([vote('s'), vote('m')])).toBe(1);
  });

  it('beregner range 2 korrekt (s til xl gir 3, xs til m gir 2)', () => {
    expect(calculateRange([vote('xs'), vote('m')])).toBe(2);
  });

  it('beregner range 3 korrekt (s til xl)', () => {
    expect(calculateRange([vote('s'), vote('xl')])).toBe(3);
  });

  it('beregner maksimal range 4 korrekt (xs til xl)', () => {
    expect(calculateRange([vote('xs'), vote('xl')])).toBe(4);
  });

  it('tar min og max av alle stemmer (ikke bare første og siste)', () => {
    expect(calculateRange([vote('m'), vote('xs'), vote('xl'), vote('s')])).toBe(4);
  });
});

// ── rangeToSeaState ─────────────────────────────────────────

describe('rangeToSeaState', () => {
  it('range 0 → calm (Stille hav)', () => {
    expect(rangeToSeaState(0)).toBe('calm');
  });

  it('range 1 → ripples (Litt bølger)', () => {
    expect(rangeToSeaState(1)).toBe('ripples');
  });

  it('range 2 → choppy (Urolig sjø)', () => {
    expect(rangeToSeaState(2)).toBe('choppy');
  });

  it('range 3 → storm (Storm)', () => {
    expect(rangeToSeaState(3)).toBe('storm');
  });

  it('range 4 → hurricane (Orkan)', () => {
    expect(rangeToSeaState(4)).toBe('hurricane');
  });
});

// ── SpreadOMeter komponent – alle 5 tilstander ───────────────

describe('SpreadOMeter', () => {
  it('viser ingenting for tom stemmeliste', () => {
    const { container } = render(<SpreadOMeter votes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('returnerer ingenting ved konsensus (range 0) — skjules fordi banner dekker det', () => {
    const { container } = render(<SpreadOMeter votes={[vote('m'), vote('m'), vote('m')]} />);
    expect(container.firstChild).toBeNull();
  });

  it('Tilstand "Litt bølger" – range 1', () => {
    render(<SpreadOMeter votes={[vote('m'), vote('l')]} />);
    expect(screen.getByText(/Litt bølger/)).toBeInTheDocument();
    expect(screen.getByText(/nesten enige/)).toBeInTheDocument();
  });

  it('Tilstand "Urolig sjø" – range 2', () => {
    render(<SpreadOMeter votes={[vote('xs'), vote('m')]} />);
    expect(screen.getByText(/Urolig sjø/)).toBeInTheDocument();
    expect(screen.getByText(/noe spredning i teamet/)).toBeInTheDocument();
  });

  it('Tilstand "Storm" – range 3', () => {
    render(<SpreadOMeter votes={[vote('s'), vote('xl')]} />);
    expect(screen.getByText(/Storm!/)).toBeInTheDocument();
    expect(screen.getByText(/stor uenighet, diskuter\?/)).toBeInTheDocument();
  });

  it('Tilstand "Orkan" – range 4 (xs til xl)', () => {
    render(<SpreadOMeter votes={[vote('xs'), vote('xl')]} />);
    expect(screen.getByText(/Orkan!/)).toBeInTheDocument();
    expect(screen.getByText(/alle er på forskjellige planeter/)).toBeInTheDocument();
  });

  it('har role=region og aria-label for tilgjengelighet', () => {
    // Trenger range > 0 for at komponenten ikke returnerer null (range 0 skjules — banner dekker det)
    render(<SpreadOMeter votes={[vote('m'), vote('xl')]} />);
    expect(screen.getByRole('region', { name: /havtilstand/i })).toBeInTheDocument();
  });

  it('én stemme gir ingenting (range 0) — skjules', () => {
    const { container } = render(<SpreadOMeter votes={[vote('xl')]} />);
    expect(container.firstChild).toBeNull();
  });
});
