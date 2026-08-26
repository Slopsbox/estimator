import type { HealthCheckPrototypeResult } from '../services';

const FORMULA_PREFIX_PATTERN = /^[\s\p{Cf}]*[=+@-]/u;
const CSV_QUOTING_PATTERN = /[;"\r\n]/;

export function escapeHealthCheckCsvText(value: string): string {
  const normalized = value.normalize('NFKC');
  const formulaSafe = FORMULA_PREFIX_PATTERN.test(normalized) ? `'${normalized}` : normalized;
  return CSV_QUOTING_PATTERN.test(formulaSafe)
    ? `"${formulaSafe.replace(/"/g, '""')}"`
    : formulaSafe;
}

export function createHealthCheckReportCsv(report: HealthCheckPrototypeResult): string {
  const rows: string[][] = [[
    'Squad', 'Måledato', 'Område', 'Områdesnitt', 'Spørsmål', 'Spørsmålssnitt', 'Antall svar',
  ]];
  for (const area of report.areas) {
    for (const question of area.questions) {
      rows.push([
        report.squadName,
        report.measurementDate,
        area.title,
        formatCsvNumber(area.average),
        question.text,
        formatCsvNumber(question.average),
        String(report.responseCount),
      ]);
    }
  }
  return `${rows.map((row) => row.map(escapeHealthCheckCsvText).join(';')).join('\r\n')}\r\n`;
}

export function healthCheckReportFilename(report: HealthCheckPrototypeResult): string {
  const squad = report.squadName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'squad';
  return `${squad}-${report.measurementDate}-helsesjekk.csv`;
}

export function downloadHealthCheckReport(report: HealthCheckPrototypeResult): boolean {
  let objectUrl: string | undefined;
  let anchor: HTMLAnchorElement | undefined;
  try {
    const blob = new Blob([createHealthCheckReportCsv(report)], { type: 'text/csv;charset=utf-8' });
    objectUrl = URL.createObjectURL(blob);
    anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = healthCheckReportFilename(report);
    anchor.rel = 'noopener';
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl as string), 0);
    return true;
  } catch {
    anchor?.remove();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    return false;
  }
}

function formatCsvNumber(value: number): string {
  return value.toFixed(1).replace('.', ',');
}
