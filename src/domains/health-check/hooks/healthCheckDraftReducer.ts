import {
  flattenHealthCheckQuestions,
  SQUAD_HEALTH_TEMPLATE_V1,
  validateHealthCheckResponses,
  type HealthCheckResponseMap,
  type QuestionKey,
  type SevenPointScore,
} from '../domain';

const questions = flattenHealthCheckQuestions(SQUAD_HEALTH_TEMPLATE_V1);

export interface HealthCheckDraftState {
  readonly responses: Partial<HealthCheckResponseMap>;
  readonly currentQuestionIndex: number;
  readonly view: 'question' | 'submit';
}

export type HealthCheckDraftAction =
  | { readonly type: 'answer'; readonly questionKey: QuestionKey; readonly score: SevenPointScore }
  | { readonly type: 'next'; readonly questionCount: number };

export function createHealthCheckDraftState(): HealthCheckDraftState {
  return {
    responses: {},
    currentQuestionIndex: 0,
    view: 'question',
  };
}

export function healthCheckDraftReducer(
  state: HealthCheckDraftState,
  action: HealthCheckDraftAction,
): HealthCheckDraftState {
  const currentQuestion = questions[state.currentQuestionIndex];
  if (state.view !== 'question' || !currentQuestion) return state;

  switch (action.type) {
    case 'answer':
      if (action.questionKey !== currentQuestion.key
        || !Number.isInteger(action.score) || action.score < 1 || action.score > 7) return state;
      return {
        ...state,
        responses: { ...state.responses, [action.questionKey]: action.score },
      };
    case 'next':
      if (action.questionCount !== questions.length
        || state.responses[currentQuestion.key] === undefined) return state;
      if (state.currentQuestionIndex >= action.questionCount - 1) {
        return validateHealthCheckResponses(state.responses).valid
          ? { ...state, currentQuestionIndex: action.questionCount - 1, view: 'submit' }
          : state;
      }
      return { ...state, currentQuestionIndex: state.currentQuestionIndex + 1 };
  }
}
