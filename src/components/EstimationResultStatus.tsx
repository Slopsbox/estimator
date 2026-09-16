import { requiresReestimation } from '../lib/estimationDecision';

interface EstimationResultStatusProps {
  votes: Array<{ size: string; value: string }>;
}

export function EstimationResultStatus({ votes }: EstimationResultStatusProps) {
  if (votes.length === 0) return null;

  const needsReestimation = requiresReestimation(votes);
  const title = needsReestimation
    ? 'Ta en prat før dere går videre'
    : 'Resultatet er klart';
  const description = needsReestimation
    ? 'Stemmene spriker nok til at saken bør estimeres på nytt.'
    : 'Stemmene er nær nok hverandre til å gå videre.';

  return (
    <div
      role="status"
      className="rounded-xl border px-5 py-5 text-center"
      style={{
        background: needsReestimation ? '#FFF4E0' : '#E8F4ED',
        borderColor: needsReestimation ? 'var(--color-warning)' : 'var(--color-success)',
        color: 'var(--color-neutral-900)',
      }}
    >
      <span
        className="mx-auto flex h-9 w-9 items-center justify-center rounded-full"
        style={{
          background: needsReestimation ? 'var(--color-warning)' : 'var(--color-success)',
          color: 'white',
        }}
        aria-hidden="true"
      >
        {needsReestimation ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 5.5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="10" cy="14" r="1" fill="currentColor" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="m5.5 10 3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <strong className="mt-3 block text-base font-extrabold">{title}</strong>
      <span className="mx-auto mt-1 block max-w-sm text-sm font-medium leading-5" style={{ color: 'var(--color-neutral-700)' }}>
        {description}
      </span>
    </div>
  );
}
