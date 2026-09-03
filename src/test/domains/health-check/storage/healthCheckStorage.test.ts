import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readHealthCheckDraft,
  writeHealthCheckDraft,
} from '../../../../domains/health-check/storage/healthCheckStorage';

describe('healthCheckStorage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('removes expired drafts while writing a current draft', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-03T12:00:00Z').getTime());
    sessionStorage.setItem('estimat_health_check_draft:expired', JSON.stringify({
      responses: { joy_look_forward: 4 },
      currentQuestionIndex: 0,
      view: 'question',
      returnToReview: false,
      updatedAt: '2026-09-02T11:59:59Z',
    }));

    writeHealthCheckDraft('current', {
      responses: { joy_look_forward: 5 },
      currentQuestionIndex: 1,
      view: 'question',
      returnToReview: false,
    });

    expect(sessionStorage.getItem('estimat_health_check_draft:expired')).toBeNull();
    expect(readHealthCheckDraft('current')).toMatchObject({ currentQuestionIndex: 1 });
  });
});
