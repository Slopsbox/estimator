import { SQUAD_HEALTH_TEMPLATE_V1, type AreaKey } from '../domain';

const PROTOTYPE_SCORES: Readonly<Record<AreaKey, number>> = {
  joy_energy: 5.8,
  people_safety: 6.1,
  direction_meaning: 5.4,
  quality_technical_health: 4.7,
  squad_collaboration: 5.2,
  organization_collaboration: 4.3,
  learning_improvement: 5.6,
};

export const PROTOTYPE_HEALTH_REPORT = {
  measurementDate: '2026-08-15',
  responseCount: 6,
  areas: SQUAD_HEALTH_TEMPLATE_V1.areas.map((area) => ({
    key: area.key,
    title: area.title,
    score: PROTOTYPE_SCORES[area.key],
  })),
} as const;

const FORMULA_PREFIX_PATTERN = /^[\s\p{Cf}]*[=+@-]/u;
const CSV_QUOTING_PATTERN = /[;"\r\n]/;

export function escapePrototypeCsvText(value: string): string {
  const normalizedValue = value.normalize('NFKC');
  const formulaSafeValue = FORMULA_PREFIX_PATTERN.test(normalizedValue)
    ? `'${normalizedValue}`
    : normalizedValue;
  return CSV_QUOTING_PATTERN.test(formulaSafeValue)
    ? `"${formulaSafeValue.replace(/"/g, '""')}"`
    : formulaSafeValue;
}

export function createPrototypeReportCsv(): string {
  const rows = [
    ['Advarsel', 'Måledato', 'Områdenøkkel', 'Område', 'Poeng (av 7)', 'Antall svar'],
    ...PROTOTYPE_HEALTH_REPORT.areas.map((area) => [
      'SYNTETISKE DEMODATA',
      PROTOTYPE_HEALTH_REPORT.measurementDate,
      area.key,
      area.title,
      area.score.toFixed(1).replace('.', ','),
      String(PROTOTYPE_HEALTH_REPORT.responseCount),
    ]),
  ];

  return `${rows
    .map((row) => row.map(escapePrototypeCsvText).join(';'))
    .join('\r\n')}\r\n`;
}
