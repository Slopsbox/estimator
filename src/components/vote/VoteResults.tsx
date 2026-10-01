import { EstimationResultStatus } from '../EstimationResultStatus';
import { NavyPageLayout } from '../NavyPageLayout';
import { SIZE_ORDER, VALUE_MEDAL, VALUES } from '../../lib/constants';
import type { Size, Value, Vote } from '../../lib/types';

interface VoteResultsProps {
  name: string;
  votes: Vote[];
  ownVote: Vote | null;
  currentRound?: number;
  onLeave?: () => void;
}

function formatVote(size: string, value: Value): string {
  return `${size.toUpperCase()} · ${VALUE_MEDAL[value]} ${VALUES.find((item) => item.key === value)?.label}`;
}

function getVoteHeadline(value: Value): string {
  if (value === 'gold') return 'Maksimal effekt';
  if (value === 'silver') return 'God fremdrift';
  return 'Nyttig steg';
}

function getVoteSubline(value: Value): string {
  if (value === 'gold') return 'Dette flytter OKR-en fremover.';
  if (value === 'silver') return 'En solid leveranse med tydelig kobling.';
  return 'Verdifullt når kapasiteten er der.';
}

export function VoteResults({
  name: _name,
  votes,
  ownVote,
  currentRound,
  onLeave,
}: VoteResultsProps) {
  const uniqueVotes = Array.from(
    new Map(votes.map((vote) => [vote.participant_id, vote])).values(),
  );
  const otherVotes = uniqueVotes
    .filter((vote) => vote.participant_id !== ownVote?.participant_id)
    .sort((a, b) => SIZE_ORDER[a.size as Size] - SIZE_ORDER[b.size as Size]);

  const roundBadge = currentRound !== undefined ? (
    <span
      className="rounded-full px-3 py-1 text-xs font-medium"
      style={{ background: 'rgba(255,255,255,0.1)', color: '#A0BADE' }}
    >
      Runde {currentRound}
    </span>
  ) : undefined;

  return (
    <NavyPageLayout
      roleLabel="Deltager"
      onBack={onLeave}
      backLabel="Forlat sesjon"
      headerRight={roundBadge}
      navyContent={(
        <div className="text-center">
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0 }}>
            Resultater!
          </h1>
        </div>
      )}
    >
      <div className="-mx-6 -mt-8 space-y-4 px-4 pb-8 pt-6 sm:mx-auto sm:max-w-xl sm:px-0">
        <EstimationResultStatus votes={uniqueVotes} />

        {ownVote ? (
          <section
            className="animate-popIn rounded-xl px-4 pb-6 pt-5 text-center"
            style={{
              background: 'white',
              borderWidth: '1px',
              borderTopWidth: '4px',
              borderStyle: 'solid',
              borderColor: 'var(--color-neutral-200)',
              borderTopColor: 'var(--color-red-600)',
              color: 'var(--color-navy-900)',
            }}
            aria-labelledby="own-vote-heading"
            aria-label="Din stemme"
            role="region"
          >
            <h2 id="own-vote-heading" className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-red-600)' }}>
              Din stemme
            </h2>
            <div className="mt-3 flex flex-col items-center">
              <span className="text-6xl leading-none" aria-hidden="true">
                {VALUE_MEDAL[ownVote.value as Value]}
              </span>
              <span className="mt-2 rounded-full px-3 py-1 text-xs font-bold" style={{ background: 'var(--color-neutral-100)', color: 'var(--color-navy-900)' }}>
                {VALUES.find((item) => item.key === ownVote.value)?.label}
              </span>
              <p className="mt-3 text-5xl font-extrabold leading-none tracking-tight">
                {ownVote.size.toUpperCase()}
              </p>
              <p className="mt-3 text-xl font-extrabold tracking-tight">
                {getVoteHeadline(ownVote.value as Value)}
              </p>
              <p className="mt-1 text-sm font-medium" style={{ color: 'var(--color-neutral-500)' }}>
                {getVoteSubline(ownVote.value as Value)}
              </p>
              <div className="mt-5 flex items-center justify-center gap-2" aria-label="Din vurdering">
                <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-red-600)' }} aria-hidden="true" />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-red-600)' }}>
                  Din vurdering
                </span>
                <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-red-600)' }} aria-hidden="true" />
              </div>
            </div>
          </section>
        ) : null}

        <section className="space-y-2" aria-labelledby="other-votes-heading">
          <h2 id="other-votes-heading" className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-neutral-500)' }}>
            Andre stemmer
          </h2>
          {otherVotes.length > 0 ? (
            <ul className="divide-y overflow-hidden rounded-lg border bg-white" style={{ borderColor: 'var(--color-neutral-200)' }} aria-label="Andre stemmer">
              {otherVotes.map((vote) => (
                <li key={vote.id} className="px-4 py-3 text-sm font-semibold" style={{ color: 'var(--color-navy-900)' }}>
                  {formatVote(vote.size, vote.value as Value)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border bg-white px-4 py-3 text-sm" style={{ borderColor: 'var(--color-neutral-200)', color: 'var(--color-neutral-500)' }}>
              Ingen andre stemmer.
            </p>
          )}
        </section>
      </div>
    </NavyPageLayout>
  );
}

export type { VoteResultsProps };
