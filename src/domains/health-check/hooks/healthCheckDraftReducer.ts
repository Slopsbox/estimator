import type {
  HealthCheckResponseMap,
  QuestionKey,
  SevenPointScore,
} from '../domain';

export interface HealthCheckDraftState {
  readonly responses: Partial<HealthCheckResponseMap>;
  readonly currentQuestionIndex: number;
  readonly view: 'question' | 'review';
  readonly returnToReview: boolean;
}

export type HealthCheckDraftAction =
  | { readonly type: 'answer'; readonly questionKey: QuestionKey; readonly score: SevenPointScore }
  | { readonly type: 'previous' }
  | { readonly type: 'next'; readonly questionCount: number; readonly canReview?: boolean }
  | { readonly type: 'edit'; readonly questionIndex: number };

export function createHealthCheckDraftState(): HealthCheckDraftState {
  return {
    responses: {},
    currentQuestionIndex: 0,
    view: 'question',
    returnToReview: false,
  };
}

export function healthCheckDraftReducer(
  state: HealthCheckDraftState,
  action: HealthCheckDraftAction,
): HealthCheckDraftState {
  switch (action.type) {
    case 'answer':
      return {
        ...state,
        responses: { ...state.responses, [action.questionKey]: action.score },
      };
    case 'previous':
      return {
        ...state,
        currentQuestionIndex: Math.max(0, state.currentQuestionIndex - 1),
      };
    case 'next':
      if (state.returnToReview) {
        return { ...state, view: 'review', returnToReview: false };
      }
      if (state.currentQuestionIndex >= action.questionCount - 1) {
        return action.canReview === false ? state : { ...state, view: 'review' };
      }
      return { ...state, currentQuestionIndex: state.currentQuestionIndex + 1 };
    case 'edit':
      return {
        ...state,
        view: 'question',
        currentQuestionIndex: action.questionIndex,
        returnToReview: true,
      };
  }
}
