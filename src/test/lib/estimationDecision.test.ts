import { describe, expect, it } from 'vitest';
import {
  calculateDisagreement,
  calculateRange,
  calculateValueRange,
  requiresReestimation,
} from '../../lib/estimationDecision';
import type { Size, Value } from '../../lib/types';

const vote = (size: Size, value: Value = 'silver') => ({ size, value });

describe('calculateRange', () => {
  it('returnerer 0 for tom stemmeliste', () => {
    expect(calculateRange([])).toBe(0);
  });

  it('beregner avstanden mellom laveste og høyeste størrelse', () => {
    expect(calculateRange([vote('m'), vote('xs'), vote('xl'), vote('s')])).toBe(4);
  });
});

describe('calculateValueRange', () => {
  it('returnerer 0 når alle vurderer verdien likt', () => {
    expect(calculateValueRange([vote('m', 'silver'), vote('l', 'silver')])).toBe(0);
  });

  it('beregner avstanden fra Bronse til Gull som 2', () => {
    expect(calculateValueRange([vote('m', 'bronze'), vote('m', 'gold')])).toBe(2);
  });
});

describe('calculateDisagreement', () => {
  it('krever ny estimering ved minst to størrelsestrinn', () => {
    expect(calculateDisagreement([vote('s'), vote('l')])).toMatchObject({
      sizeRange: 2,
      valueRange: 0,
      requiresReestimation: true,
    });
  });

  it('krever ny estimering ved Bronse mot Gull', () => {
    expect(calculateDisagreement([vote('m', 'bronze'), vote('m', 'gold')])).toMatchObject({
      sizeRange: 0,
      valueRange: 2,
      requiresReestimation: true,
    });
  });

  it('krever ikke ny estimering ved ett trinn på begge skalaer', () => {
    expect(requiresReestimation([vote('m', 'silver'), vote('l', 'gold')])).toBe(false);
  });
});
