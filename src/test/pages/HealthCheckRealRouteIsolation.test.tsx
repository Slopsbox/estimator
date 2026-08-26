import { describe, expect, it } from 'vitest';

describe('real Health Check routes', () => {
  it('never import synthetic prototype constants or modules', async () => {
    const [dashboard, respond, resultPanel, report] = await Promise.all([
      import('../../pages/HealthCheckDashboard?raw').then((module) => module.default),
      import('../../pages/HealthCheckRespond?raw').then((module) => module.default),
      import('../../domains/health-check/components/RealHealthResultPanel?raw').then((module) => module.default),
      import('../../domains/health-check/report/healthCheckReport?raw').then((module) => module.default),
    ]);
    const source = [dashboard, respond, resultPanel, report].join('\n');

    expect(source).not.toContain('/prototype/');
    expect(source).not.toContain('PROTOTYPE_HEALTH_REPORT');
    expect(source).not.toContain('PROTOTYPE_SCORES');
    expect(source).not.toContain('syntetiske demodata');
    expect(source).not.toContain('localStorage');
  });
});
