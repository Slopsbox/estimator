import { describe, expect, it } from 'vitest';
import {
  flattenHealthCheckQuestions,
  SQUAD_HEALTH_TEMPLATE_V1,
  type SevenPointScore,
} from '../../../../domains/health-check/domain';
import {
  createHealthCheckDraftState,
  healthCheckDraftReducer,
  type HealthCheckDraftState,
} from '../../../../domains/health-check/hooks/healthCheckDraftReducer';

const questions = flattenHealthCheckQuestions(SQUAD_HEALTH_TEMPLATE_V1);
const next = { type: 'next' as const, questionCount: questions.length };

describe('healthCheckDraftReducer', () => {
  it('holder svar fraværende frem til et spørsmål faktisk besvares', () => {
    const initial = createHealthCheckDraftState();

    expect(initial).toEqual({ responses: {}, currentQuestionIndex: 0, view: 'question' });

    const answered = healthCheckDraftReducer(initial, {
      type: 'answer',
      questionKey: 'joy_look_forward',
      score: 4,
    });

    expect(answered.responses).toEqual({ joy_look_forward: 4 });
    expect(initial.responses).toEqual({});
  });

  it('krever svar før Neste og tillater bare gjeldende kanoniske spørsmål', () => {
    const initial = createHealthCheckDraftState();
    expect(healthCheckDraftReducer(initial, next)).toBe(initial);
    expect(healthCheckDraftReducer(initial, {
      type: 'answer', questionKey: questions[1].key, score: 5,
    })).toBe(initial);

    const answered = healthCheckDraftReducer(initial, {
      type: 'answer', questionKey: questions[0].key, score: 4,
    });
    const changed = healthCheckDraftReducer(answered, {
      type: 'answer', questionKey: questions[0].key, score: 6,
    });
    expect(changed.responses[questions[0].key]).toBe(6);
    const advanced = healthCheckDraftReducer(changed, next);
    expect(advanced.currentQuestionIndex).toBe(1);
    expect(healthCheckDraftReducer(advanced, {
      type: 'answer', questionKey: questions[0].key, score: 1,
    })).toBe(advanced);
    expect(healthCheckDraftReducer(advanced, next)).toBe(advanced);
  });

  it('venter på siste Neste, går til submit og låser alle svar og indeksen', () => {
    let state = createHealthCheckDraftState();
    for (const [index, question] of questions.entries()) {
      state = healthCheckDraftReducer(state, {
        type: 'answer', questionKey: question.key, score: 5,
      });
      expect(state.view).toBe('question');
      state = healthCheckDraftReducer(state, next);
      expect(state.currentQuestionIndex).toBe(Math.min(index + 1, questions.length - 1));
      expect(state.view).toBe(index === questions.length - 1 ? 'submit' : 'question');
    }
    for (const question of questions) {
      expect(healthCheckDraftReducer(state, {
        type: 'answer', questionKey: question.key, score: 1,
      })).toBe(state);
    }
    expect(healthCheckDraftReducer(state, next)).toBe(state);
  });

  it('tillater ikke submit når tidligere svar mangler', () => {
    const incomplete: HealthCheckDraftState = {
      ...createHealthCheckDraftState(),
      currentQuestionIndex: questions.length - 1,
      responses: { [questions[questions.length - 1].key]: 5 },
    };
    expect(healthCheckDraftReducer(incomplete, next)).toBe(incomplete);
  });

  it.each([0, -1, 1, questions.length - 1, questions.length + 1, 1.5, NaN, Infinity])(
    'avviser questionCount %s som ikke samsvarer med malen', (questionCount) => {
      const state = healthCheckDraftReducer(createHealthCheckDraftState(), {
        type: 'answer', questionKey: questions[0].key, score: 5,
      });
      expect(healthCheckDraftReducer(state, { type: 'next', questionCount })).toBe(state);
    },
  );

  it.each([0, 8, 1.5, NaN, Infinity])('avviser ugyldig score %s', (score) => {
    const state = createHealthCheckDraftState();
    expect(healthCheckDraftReducer(state, {
      type: 'answer', questionKey: questions[0].key, score: score as SevenPointScore,
    })).toBe(state);
  });
});
