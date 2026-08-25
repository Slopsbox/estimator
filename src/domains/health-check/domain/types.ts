import type {
  Area,
  AreaKey,
  HealthCheckTemplate,
  Question,
  QuestionKey,
  TemplateVersion,
} from './template';

export type { Area, AreaKey, HealthCheckTemplate, Question, QuestionKey, TemplateVersion };

export type SevenPointScore = keyof HealthCheckTemplate['scoreLabels'];
export type HealthScoreLabel = HealthCheckTemplate['scoreLabels'][SevenPointScore];

export type HealthCheckValidationErrorCode =
  | 'MISSING_QUESTION'
  | 'UNKNOWN_QUESTION'
  | 'NON_INTEGER_SCORE'
  | 'SCORE_OUT_OF_RANGE';

export type HealthCheckResponseValidationResult =
  | {
      readonly valid: true;
      readonly value: Readonly<Record<QuestionKey, SevenPointScore>>;
    }
  | {
      readonly valid: false;
      readonly errors: readonly { readonly code: HealthCheckValidationErrorCode }[];
    };

export interface QuestionAggregateSnapshot {
  readonly sum: number;
  readonly count: number;
}

export interface AggregateSnapshot {
  readonly templateVersion: TemplateVersion;
  readonly expectedRespondentCount: number;
  readonly questions: Readonly<Record<QuestionKey, QuestionAggregateSnapshot>>;
}

export interface QuestionAverage {
  readonly questionKey: QuestionKey;
  readonly areaKey: AreaKey;
  readonly average: number;
}

export interface AreaAverage {
  readonly areaKey: AreaKey;
  readonly average: number;
}

export interface HealthCheckAggregate {
  readonly templateVersion: TemplateVersion;
  readonly responseCount: number;
  readonly questionAverages: readonly QuestionAverage[];
  readonly areaAverages: readonly AreaAverage[];
}

export type AggregateValidationErrorCode =
  | 'INVALID_TEMPLATE_VERSION'
  | 'MISSING_QUESTION'
  | 'UNKNOWN_QUESTION'
  | 'INVALID_COUNT'
  | 'COUNT_BELOW_MINIMUM'
  | 'COUNT_MISMATCH'
  | 'INVALID_SUM';

export type AggregateValidationResult =
  | { readonly valid: true; readonly value: HealthCheckAggregate }
  | {
      readonly valid: false;
      readonly errors: readonly { readonly code: AggregateValidationErrorCode }[];
    };
