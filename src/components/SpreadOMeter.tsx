import { SIZES, VALUES } from '../lib/constants';
import { calculateDisagreement } from '../lib/spreadOMeter';
import type { Size, Value } from '../lib/types';

export interface SpreadOMeterProps {
  votes: Array<{ size: string; value: string }>;
}

interface VoteScaleProps<T extends string> {
  label: string;
  options: ReadonlyArray<{ key: T; label: string }>;
  counts: Map<T, number>;
}

function voteCountLabel(label: string, count: number): string {
  return `${label}: ${count} ${count === 1 ? 'stemme' : 'stemmer'}`;
}

function VoteScale<T extends string>({ label, options, counts }: VoteScaleProps<T>) {
  const maxCount = Math.max(1, ...counts.values());

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-neutral-700)' }}>
        {label}
      </p>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        role="list"
        aria-label={`${label} – stemmefordeling`}
      >
        {options.map((option) => {
          const count = counts.get(option.key) ?? 0;
          const active = count > 0;
          return (
            <div
              key={option.key}
              className="relative min-w-0 overflow-hidden rounded-lg border px-1 py-2 text-center"
              style={{
                background: active ? '#FFFFFF' : 'rgba(255,255,255,0.45)',
                borderColor: active ? 'var(--color-navy-500)' : 'var(--color-neutral-200)',
                color: active ? 'var(--color-navy-900)' : 'var(--color-neutral-700)',
              }}
              aria-label={voteCountLabel(option.label, count)}
              role="listitem"
            >
              {active ? (
                <span
                  className="absolute inset-x-0 bottom-0"
                  style={{
                    height: `${Math.max(12, (count / maxCount) * 100)}%`,
                    background: 'var(--color-navy-50)',
                  }}
                  aria-hidden="true"
                />
              ) : null}
              <span className="relative block text-xs font-bold">{option.label}</span>
              <span className="relative block text-xs tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Viser teamets risikovurdering og stemmefordeling etter avsløring. */
export function SpreadOMeter({ votes }: SpreadOMeterProps) {
  if (votes.length === 0) return null;

  const disagreement = calculateDisagreement(votes);
  if (disagreement.sizeRange === 0 && disagreement.valueRange === 0) return null;

  const sizeCounts = new Map<Size, number>();
  const valueCounts = new Map<Value, number>();
  for (const vote of votes) {
    const size = vote.size as Size;
    const value = vote.value as Value;
    sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1);
    valueCounts.set(value, (valueCounts.get(value) ?? 0) + 1);
  }

  const isCritical = disagreement.requiresReestimation;
  const valueOptions = VALUES.map(({ key, label }) => ({ key, label }));

  return (
    <section
      className="space-y-4 rounded-2xl border-2 px-4 py-4 animate-slideIn"
      style={{
        background: isCritical ? '#FFF4E0' : '#E8EEF8',
        borderColor: isCritical ? 'var(--color-warning)' : 'var(--color-navy-200)',
      }}
      aria-label="Teamets risikovurdering"
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none" aria-hidden="true">
          {isCritical ? '🛡️' : '🔎'}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--color-navy-900)' }}>
            {isCritical ? 'Ulik risikovurdering!' : 'Nesten samme risikovurdering'}
          </h2>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--color-neutral-700)' }}>
            {isCritical
              ? 'Denne må vi snakke om og estimere på nytt.'
              : 'En rask avklaring bør være nok.'}
          </p>
          {isCritical ? (
            <span
              className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-extrabold"
              style={{ background: '#FFE4A8', color: 'var(--color-navy-900)' }}
            >
              Estimer på nytt
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <VoteScale label="Størrelse" options={SIZES} counts={sizeCounts} />
        <VoteScale label="Verdi" options={valueOptions} counts={valueCounts} />
      </div>
    </section>
  );
}
