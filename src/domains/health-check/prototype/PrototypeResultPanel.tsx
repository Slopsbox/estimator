import { PROTOTYPE_HEALTH_REPORT } from './prototypeReport';

const dateFormatter = new Intl.DateTimeFormat('nb-NO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});
const scoreFormatter = new Intl.NumberFormat('nb-NO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatPrototypeDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

export function PrototypeResultPanel() {
  return (
    <section
      aria-labelledby="prototype-result-heading"
      className="overflow-hidden rounded-xl border bg-white"
      style={{ borderColor: 'var(--color-neutral-200)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="p-4 sm:p-5">
        <p className="text-sm font-bold" style={{ color: 'var(--color-red-600)' }}>
          Syntetiske demodata
        </p>
        <h2
          id="prototype-result-heading"
          className="mt-1 text-xl font-bold"
          style={{ color: 'var(--color-navy-900)' }}
        >
          Prototype-resultat
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-neutral-700)' }}>
          Måledato {formatPrototypeDate(PROTOTYPE_HEALTH_REPORT.measurementDate)}. Alle områdene bygger på{' '}
          {PROTOTYPE_HEALTH_REPORT.responseCount} syntetiske svar.
        </p>
      </div>

      <div
        tabIndex={0}
        role="region"
        aria-label="Rullbar tabell med områderesultater"
        className="overflow-x-auto border-y focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-navy-700)]"
        style={{ borderColor: 'var(--color-neutral-200)' }}
      >
        <table aria-label="Områderesultater" className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <thead style={{ background: 'var(--color-neutral-100)', color: 'var(--color-neutral-700)' }}>
            <tr>
              <th scope="col" className="px-4 py-3 font-bold">Område</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">Poeng</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">Svar</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--color-neutral-200)' }}>
            {PROTOTYPE_HEALTH_REPORT.areas.map((area) => (
              <tr key={area.key}>
                <th scope="row" className="px-4 py-3 font-bold" style={{ color: 'var(--color-neutral-900)' }}>
                  {area.title}
                </th>
                <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--color-neutral-700)' }}>
                  {scoreFormatter.format(area.score)}/7
                </td>
                <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--color-neutral-700)' }}>
                  {PROTOTYPE_HEALTH_REPORT.responseCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul
        aria-label="Viktig om demoresultatet"
        className="list-disc space-y-2 px-9 py-4 text-sm"
        style={{ color: 'var(--color-neutral-700)' }}
      >
        <li>Resultatet bruker kun syntetiske demodata.</li>
        <li>Et ekte resultat er et gruppeaggregat. Med én deltaker er det lik deltakerens svar og ikke anonymt; i små grupper kan det tilskrives enkeltpersoner.</li>
      </ul>
    </section>
  );
}
