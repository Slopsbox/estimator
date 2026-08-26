import type { HealthCheckPrototypeResult } from '../services';

const dateFormatter = new Intl.DateTimeFormat('nb-NO', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
});
const scoreFormatter = new Intl.NumberFormat('nb-NO', {
  minimumFractionDigits: 1, maximumFractionDigits: 1,
});

export function RealHealthResultPanel({ result }: { readonly result: HealthCheckPrototypeResult }) {
  return (
    <section
      aria-labelledby="health-result-heading"
      className="overflow-hidden rounded-xl border bg-white"
      style={{ borderColor: 'var(--color-neutral-200)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="p-4 sm:p-5">
        <p className="text-sm font-bold" style={{ color: 'var(--color-success)' }}>Helsesjekk fullført</p>
        <h2 id="health-result-heading" className="mt-1 break-words text-xl font-bold" style={{ color: 'var(--color-navy-900)' }}>
          Resultat for {result.squadName}
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-neutral-700)' }}>
          Måledato {dateFormatter.format(new Date(`${result.measurementDate}T00:00:00Z`))}. Resultatet bygger på {result.responseCount} {result.responseCount === 1 ? 'svar' : 'svar'}.
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
            <tr><th scope="col" className="px-4 py-3">Område</th><th scope="col" className="px-4 py-3 text-right">Poeng</th><th scope="col" className="px-4 py-3 text-right">Svar</th></tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--color-neutral-200)' }}>
            {result.areas.map((area) => (
              <tr key={area.areaKey}>
                <th scope="row" className="px-4 py-3 font-bold" style={{ color: 'var(--color-neutral-900)' }}>{area.title}</th>
                <td className="px-4 py-3 text-right tabular-nums">{scoreFormatter.format(area.average)}/7</td>
                <td className="px-4 py-3 text-right tabular-nums">{result.responseCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-4 text-sm" style={{ color: 'var(--color-neutral-700)' }}>
        Med én deltaker er resultatet ikke anonymt. Også i små grupper kan resultatet tilskrives enkeltpersoner.
      </p>
    </section>
  );
}
