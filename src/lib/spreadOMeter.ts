import { SIZE_ORDER } from './constants';
import type { Size, Value } from './types';

const VALUE_ORDER: Record<Value, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
};

export interface DisagreementResult {
  sizeRange: number;
  valueRange: number;
  requiresReestimation: boolean;
}

function calculateScoreRange(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.max(...scores) - Math.min(...scores);
}

/** Beregn avstanden mellom laveste og høyeste størrelse. */
export function calculateRange(votes: Array<{ size: string }>): number {
  return calculateScoreRange(votes.map((vote) => SIZE_ORDER[vote.size as Size] ?? 0));
}

/** Beregn avstanden mellom laveste og høyeste verdivurdering. */
export function calculateValueRange(votes: Array<{ value: string }>): number {
  return calculateScoreRange(votes.map((vote) => VALUE_ORDER[vote.value as Value] ?? 0));
}

/** Et sprik på to trinn på én av skalaene krever diskusjon og ny estimering. */
export function calculateDisagreement(
  votes: Array<{ size: string; value: string }>,
): DisagreementResult {
  const sizeRange = calculateRange(votes);
  const valueRange = calculateValueRange(votes);

  return {
    sizeRange,
    valueRange,
    requiresReestimation: sizeRange >= 2 || valueRange >= 2,
  };
}

export function requiresReestimation(
  votes: Array<{ size: string; value: string }>,
): boolean {
  return calculateDisagreement(votes).requiresReestimation;
}
