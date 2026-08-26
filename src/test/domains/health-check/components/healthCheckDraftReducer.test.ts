import { describe, expect, it } from 'vitest';
import {
  createHealthCheckDraftState,
  healthCheckDraftReducer,
} from '../../../../domains/health-check/hooks/healthCheckDraftReducer';

describe('healthCheckDraftReducer', () => {
  it('holder svar fraværende frem til et spørsmål faktisk besvares', () => {
    const initial = createHealthCheckDraftState();

    expect(initial.responses).toEqual({});
    expect(initial.currentQuestionIndex).toBe(0);
    expect(initial.view).toBe('question');

    const answered = healthCheckDraftReducer(initial, {
      type: 'answer',
      questionKey: 'joy_look_forward',
      score: 4,
    });

    expect(answered.responses).toEqual({ joy_look_forward: 4 });
    expect(initial.responses).toEqual({});
  });

  it('returnerer til review etter redigering i stedet for å fortsette sekvensielt', () => {
    const reviewing = {
      ...createHealthCheckDraftState(),
      view: 'review' as const,
    };
    const editing = healthCheckDraftReducer(reviewing, { type: 'edit', questionIndex: 12 });
    const returned = healthCheckDraftReducer(editing, { type: 'next', questionCount: 31 });

    expect(editing).toMatchObject({
      view: 'question',
      currentQuestionIndex: 12,
      returnToReview: true,
    });
    expect(returned.view).toBe('review');
  });
});
