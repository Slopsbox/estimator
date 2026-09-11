import { requiresReestimation } from '../lib/estimationDecision';

interface EstimationResultStatusProps {
  votes: Array<{ size: string; value: string }>;
}

export function EstimationResultStatus({ votes }: EstimationResultStatusProps) {
  if (votes.length === 0) return null;

  const needsReestimation = requiresReestimation(votes);

  return (
    <p
      role="status"
      className="rounded-lg border px-4 py-3 text-sm font-bold"
      style={{
        background: needsReestimation ? '#FFF4E0' : '#E8F4ED',
        borderColor: needsReestimation ? 'var(--color-warning)' : 'var(--color-success)',
        color: 'var(--color-neutral-900)',
      }}
    >
      {needsReestimation
        ? 'Her må vi ta en prat og estimere på nytt'
        : 'Dette er innenfor'}
    </p>
  );
}
