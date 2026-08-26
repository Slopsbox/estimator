import { NavyPageLayout } from '../../../components/NavyPageLayout';

export interface HealthCheckLobbyMember {
  readonly memberId: string;
  readonly displayName: string;
  readonly isOnline: boolean;
}

export interface HealthCheckLobbyProps {
  readonly squadName: string;
  readonly measurementDateLabel: string;
  readonly joinCode: string;
  readonly codeCopied: boolean;
  readonly members: readonly HealthCheckLobbyMember[];
  readonly minimumRespondents?: number;
  readonly actionLoading: boolean;
  readonly error: string | null | undefined;
  readonly onCopyCode: () => void;
  readonly onStart: () => void;
  readonly onRemoveMember: (memberId: string) => void;
  readonly onAbort: () => void;
  readonly confirmRemove?: (member: HealthCheckLobbyMember) => boolean;
  readonly confirmAbort?: () => boolean;
}

const actionClassName =
  'min-h-11 touch-manipulation rounded-md px-4 font-bold transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40';

export function HealthCheckLobby({
  squadName,
  measurementDateLabel,
  joinCode,
  codeCopied,
  members,
  minimumRespondents = 5,
  actionLoading,
  error,
  onCopyCode,
  onStart,
  onRemoveMember,
  onAbort,
  confirmRemove = (member) => window.confirm(`Vil du fjerne ${member.displayName} fra helsesjekken?`),
  confirmAbort = () => window.confirm('Vil du avbryte helsesjekken?'),
}: HealthCheckLobbyProps) {
  const enforcedMinimum = Math.max(5, minimumRespondents);
  const canStart = members.length >= enforcedMinimum && !actionLoading;

  return (
    <NavyPageLayout
      roleLabel="Fasilitator"
      navyContent={
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold" style={{ color: 'var(--color-navy-200)' }}>
            Squad Health
          </p>
          <h1 className="mt-2 break-words text-3xl font-bold text-white sm:text-4xl">
            {squadName}
          </h1>
          <p className="mt-2 break-words text-sm text-white">{measurementDateLabel}</p>
        </div>
      }
    >
      <p id="health-lobby-action-status" className="sr-only" aria-live="polite">
        {actionLoading ? 'Utfører handling…' : ''}
      </p>
      <main className="mx-auto w-full max-w-2xl space-y-6 pb-10" aria-busy={actionLoading}>
        {error ? (
          <p role="alert" className="break-words text-sm" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        ) : null}

        <section
          aria-labelledby="join-code-heading"
          className="rounded-xl p-5 text-center"
          style={{ background: 'var(--color-navy-900)' }}
        >
          <h2 id="join-code-heading" className="text-sm font-bold" style={{ color: 'var(--color-navy-200)' }}>
            Deltakerkode
          </h2>
          <p className="mt-2 break-words text-4xl font-extrabold tracking-[0.2em] text-white">
            {joinCode}
          </p>
          <button
            type="button"
            onClick={onCopyCode}
            aria-label="Kopier deltakerkode"
            className={`${actionClassName} mt-2 text-sm`}
            style={{ color: 'var(--color-navy-200)' }}
          >
            <span aria-live="polite">{codeCopied ? 'Kopiert!' : 'Trykk for å kopiere'}</span>
          </button>
        </section>

        <aside
          aria-labelledby="practical-anonymity-heading"
          className="rounded-xl border bg-white p-4 text-sm"
          style={{ borderColor: 'var(--color-neutral-200)', color: 'var(--color-neutral-700)' }}
        >
          <h2 id="practical-anonymity-heading" className="font-bold" style={{ color: 'var(--color-navy-900)' }}>Praktisk anonymitet</h2>
          <p className="mt-1">
            Resultater vises samlet, aldri per person. Helsesjekken krever minst {enforcedMinimum} deltakere.
          </p>
          <p className="mt-2">
            Hvis nesten alle deltakere samarbeider og kjenner sine egne svar, kan de i noen tilfeller regne ut den siste deltakerens svar.
          </p>
        </aside>

        <section aria-labelledby="participants-heading" className="rounded-xl bg-white p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="participants-heading" className="text-xl font-bold" style={{ color: 'var(--color-navy-900)' }}>
              Deltakere
            </h2>
            <p className="text-sm tabular-nums" style={{ color: 'var(--color-neutral-500)' }}>
              {members.length} av minst {enforcedMinimum}
            </p>
          </div>

          {members.length > 0 ? (
            <ul aria-label="Deltakere" className="mt-4 divide-y" style={{ borderColor: 'var(--color-neutral-200)' }}>
              {members.map((member) => {
                const presence = member.isOnline ? 'online' : 'offline';
                return (
                  <li key={member.memberId} className="flex min-w-0 items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-bold" style={{ color: 'var(--color-neutral-900)' }}>
                        {member.displayName}
                      </p>
                      <p
                        aria-label={`${member.displayName} er ${presence}`}
                        className="mt-1 flex items-center gap-2 text-xs"
                        style={{ color: member.isOnline ? 'var(--color-success)' : 'var(--color-neutral-500)' }}
                      >
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 flex-none rounded-full"
                          style={{ background: member.isOnline ? 'var(--color-success)' : 'var(--color-neutral-300)' }}
                        />
                        {presence}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={actionLoading}
                      aria-label={`Fjern ${member.displayName}`}
                      onClick={() => {
                        if (confirmRemove(member)) onRemoveMember(member.memberId);
                      }}
                      className={`${actionClassName} flex-none text-sm`}
                      style={{ color: 'var(--color-danger)' }}
                    >
                      Fjern
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm" style={{ color: 'var(--color-neutral-500)' }}>
              Ingen deltakere har blitt med ennå.
            </p>
          )}
        </section>

        <div className="space-y-3">
          <button
            type="button"
            disabled={!canStart}
            onClick={onStart}
            className={`${actionClassName} w-full text-white`}
            style={{ background: 'var(--color-red-600)' }}
          >
            {actionLoading ? 'Starter…' : 'Start helsesjekk'}
          </button>
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => {
              if (confirmAbort()) onAbort();
            }}
            className={`${actionClassName} w-full border bg-transparent text-sm`}
            style={{ borderColor: 'var(--color-neutral-300)', color: 'var(--color-danger)' }}
          >
            Avbryt helsesjekk
          </button>
        </div>
      </main>
    </NavyPageLayout>
  );
}
