import { NavyPageLayout } from '../../../components/NavyPageLayout';

export type HealthCheckProgressStatus = 'in_progress' | 'completed';

export interface HealthCheckProgressRow {
  readonly memberId: string;
  readonly displayName: string;
  readonly status: HealthCheckProgressStatus;
  readonly isOnline?: boolean;
}

export type HealthCheckDeliveryStatus =
  | 'awaiting_materialization'
  | 'pending'
  | 'processing'
  | 'sent'
  | 'failed';

export interface HealthCheckFacilitatorDashboardProps {
  readonly squadName: string;
  readonly progressRows: readonly HealthCheckProgressRow[];
  readonly minimum?: number;
  readonly actionLoading: boolean;
  readonly error: string | null | undefined;
  readonly deliveryStatus?: HealthCheckDeliveryStatus | null;
  readonly onRemoveInProgress: (memberId: string) => void;
  readonly onFinalize: () => void;
  readonly onAbort: () => void;
  readonly confirmRemove?: (row: HealthCheckProgressRow) => boolean;
  readonly confirmAbort?: () => boolean;
  readonly confirmFinalize?: () => boolean;
}

const deliveryStatusLabels: Record<HealthCheckDeliveryStatus, string> = {
  awaiting_materialization: 'Rapport klargjøres…',
  pending: 'Rapport venter på utsending…',
  processing: 'Rapport sendes…',
  sent: 'Rapport sendt',
  failed: 'Rapport kunne ikke sendes',
};

const actionClassName =
  'min-h-11 touch-manipulation rounded-md px-4 font-bold transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40';

export function HealthCheckFacilitatorDashboard({
  squadName,
  progressRows,
  minimum = 5,
  actionLoading,
  error,
  deliveryStatus = null,
  onRemoveInProgress,
  onFinalize,
  onAbort,
  confirmRemove = (row) => window.confirm(`Vil du fjerne ${row.displayName} fra helsesjekken?`),
  confirmAbort = () => window.confirm('Vil du avbryte helsesjekken?'),
  confirmFinalize = () => window.confirm('Vil du avslutte helsesjekken og sende rapporten? Dette kan ikke angres.'),
}: HealthCheckFacilitatorDashboardProps) {
  const enforcedMinimum = Math.max(5, minimum);
  const completedCount = progressRows.filter((row) => row.status === 'completed').length;
  const deliveryLocked = deliveryStatus !== null;
  const canFinalize =
    progressRows.length >= enforcedMinimum
    && completedCount === progressRows.length
    && !actionLoading
    && !deliveryLocked;

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
          <p
            role="status"
            aria-label="Samlet fremdrift"
            className="mt-3 text-sm font-bold tabular-nums text-white"
          >
            {completedCount} av {progressRows.length} fullført
          </p>
        </div>
      }
    >
      <p id="health-dashboard-action-status" className="sr-only" aria-live="polite">
        {actionLoading ? 'Utfører handling…' : ''}
      </p>
      <main className="mx-auto w-full max-w-2xl space-y-6 pb-10" aria-busy={actionLoading}>
        {error ? (
          <p role="alert" className="break-words text-sm" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        ) : null}

        {deliveryStatus ? (
          <section
            role="status"
            aria-label="Rapportstatus"
            className="rounded-xl border bg-white p-5 text-center"
            style={{ borderColor: 'var(--color-neutral-200)' }}
          >
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-navy-900)' }}>
              {deliveryStatusLabels[deliveryStatus]}
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: deliveryStatus === 'failed' ? 'var(--color-danger)' : 'var(--color-neutral-500)' }}
            >
              {deliveryStatus === 'sent'
                ? 'Rapporten er sendt, og helsesjekken er avsluttet.'
                : deliveryStatus === 'failed'
                  ? 'Rapporten kunne ikke sendes. Systemet prøver igjen innen lagringstiden utløper.'
                  : 'Ingen handlinger er tilgjengelige mens rapporten behandles.'}
            </p>
          </section>
        ) : null}

        <section
          aria-labelledby="progress-heading"
          className="rounded-xl bg-white p-4"
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="progress-heading" className="text-xl font-bold" style={{ color: 'var(--color-navy-900)' }}>
              Deltakerstatus
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>
              Minst {enforcedMinimum} deltakere
            </p>
          </div>

          {progressRows.length > 0 ? (
            <ul aria-label="Deltakerstatus" className="mt-4 divide-y" style={{ borderColor: 'var(--color-neutral-200)' }}>
              {progressRows.map((row) => {
                const statusLabel = row.status === 'completed' ? 'Fullført' : 'Pågår';
                return (
                  <li key={row.memberId} className="flex min-w-0 items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-bold" style={{ color: 'var(--color-neutral-900)' }}>
                        {row.displayName}
                      </p>
                      {row.isOnline !== undefined ? (
                        <p
                          aria-label={`${row.displayName} er ${row.isOnline ? 'online' : 'offline'}`}
                          className="mt-1 flex items-center gap-2 text-xs"
                          style={{ color: row.isOnline ? 'var(--color-success)' : 'var(--color-neutral-500)' }}
                        >
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 flex-none rounded-full"
                            style={{ background: row.isOnline ? 'var(--color-success)' : 'var(--color-neutral-300)' }}
                          />
                          {row.isOnline ? 'online' : 'offline'}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className="flex-none text-sm font-bold"
                      style={{ color: row.status === 'completed' ? 'var(--color-success)' : 'var(--color-neutral-700)' }}
                    >
                      {statusLabel}
                    </span>
                    {row.status === 'in_progress' ? (
                      <button
                        type="button"
                        disabled={actionLoading || deliveryLocked}
                        aria-label={`Fjern ${row.displayName}`}
                        onClick={() => {
                          if (confirmRemove(row)) onRemoveInProgress(row.memberId);
                        }}
                        className={`${actionClassName} flex-none text-sm`}
                        style={{ color: 'var(--color-danger)' }}
                      >
                        Fjern
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm" style={{ color: 'var(--color-neutral-500)' }}>
              Ingen deltakere vises ennå.
            </p>
          )}
        </section>

        <div className="space-y-3">
          <button
            type="button"
            disabled={!canFinalize}
            onClick={() => {
              if (confirmFinalize()) onFinalize();
            }}
            className={`${actionClassName} w-full text-white`}
            style={{ background: 'var(--color-red-600)' }}
          >
            {actionLoading ? 'Fullfører…' : 'Fullfør helsesjekk'}
          </button>
          {!deliveryLocked ? (
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
          ) : null}
        </div>
      </main>
    </NavyPageLayout>
  );
}
