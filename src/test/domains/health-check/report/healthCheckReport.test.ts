import { describe, expect, it } from 'vitest';
import { SQUAD_HEALTH_TEMPLATE_V1 } from '../../../../domains/health-check/domain';
import { createHealthCheckReportCsv, escapeHealthCheckCsvText, healthCheckReportFilename } from '../../../../domains/health-check/report/healthCheckReport';
import type { HealthCheckPrototypeResult } from '../../../../domains/health-check/services';

function report(squadName = 'Plattform') : HealthCheckPrototypeResult {
  return {
    status: 'completed',
    reportSchemaVersion: 'health-check-prototype-v1',
    squadName,
    measurementDate: '2026-08-26',
    templateVersion: 'squad-health-v1',
    responseCount: 3,
    areas: SQUAD_HEALTH_TEMPLATE_V1.areas.map((area, index) => ({
      areaKey: area.key,
      sequence: index + 1,
      title: area.title,
      average: 4.5,
      questions: area.questions.map((question) => ({
        questionKey: question.key,
        sequence: question.sequence,
        text: question.text,
        average: 4.5,
      })),
    })),
  };
}

describe('healthCheckReport', () => {
  it('creates CSV from the actual report with all 31 questions', () => {
    const csv = createHealthCheckReportCsv(report());

    expect(csv).toContain('Plattform;2026-08-26;Arbeidsglede og energi;4,5;Jeg gleder meg som regel til arbeidsdagen.;4,5;3');
    expect(csv.trim().split('\r\n')).toHaveLength(32);
    expect(csv).not.toContain('SYNTETISKE');
  });

  it.each(['=SUM(1;1)', '+cmd', '-1+2', '@value'])('neutralizes formula input %#', (value) => {
    expect(escapeHealthCheckCsvText(value)).toMatch(/^"?'/);
  });

  it('creates a safe deterministic filename', () => {
    expect(healthCheckReportFilename(report('Økonomi & Betaling'))).toBe('konomi-betaling-2026-08-26-helsesjekk.csv');
  });
});
