import { SQUAD_HEALTH_TEMPLATE_V1 } from './template';
import type {
  AggregateValidationErrorCode,
  AggregateValidationResult,
  Area,
  HealthCheckAggregate,
  HealthCheckResponseValidationResult,
  HealthCheckTemplate,
  HealthScoreLabel,
  Question,
  QuestionAggregateSnapshot,
  QuestionKey,
  SevenPointScore,
} from './types';

type PlainRecord = Record<string, unknown>;
type OwnDataProperty = { readonly found: true; readonly value: unknown } | { readonly found: false };

export function getHealthScoreLabel(score: unknown): HealthScoreLabel {
  if (!isSevenPointScore(score)) {
    throw new RangeError('Health score must be an integer from 1 to 7');
  }

  return SQUAD_HEALTH_TEMPLATE_V1.scoreLabels[score];
}

export function flattenHealthCheckQuestions(template: HealthCheckTemplate): readonly Question[] {
  return template.areas.reduce<Question[]>((questions, area) => {
    questions.push(...area.questions);
    return questions;
  }, []);
}

export function getHealthCheckQuestion(key: string): Question | undefined {
  return flattenHealthCheckQuestions(SQUAD_HEALTH_TEMPLATE_V1).find(
    (question) => question.key === key,
  );
}

export function getHealthCheckArea(key: string): Area | undefined {
  return SQUAD_HEALTH_TEMPLATE_V1.areas.find((area) => area.key === key);
}

export function validateHealthCheckResponses(
  responses: unknown,
): HealthCheckResponseValidationResult {
  if (!isPlainRecord(responses)) {
    return invalidResponses('MISSING_QUESTION');
  }

  const expectedKeys = new Set(
    flattenHealthCheckQuestions(SQUAD_HEALTH_TEMPLATE_V1).map((question) => question.key),
  );
  const responseKeys = ownDataPropertyNames(responses);

  if (responseKeys === undefined) {
    return invalidResponses('MISSING_QUESTION');
  }
  if (responseKeys.some((key) => !isQuestionKey(key, expectedKeys))) {
    return invalidResponses('UNKNOWN_QUESTION');
  }

  const normalizedResponses: Partial<Record<QuestionKey, SevenPointScore>> = {};
  for (const key of expectedKeys) {
    const property = getOwnDataProperty(responses, key);
    if (!property.found) {
      return invalidResponses('MISSING_QUESTION');
    }
    const score = property.value;
    if (typeof score !== 'number' || !Number.isSafeInteger(score)) {
      return invalidResponses('NON_INTEGER_SCORE');
    }
    if (!isSevenPointScore(score)) {
      return invalidResponses('SCORE_OUT_OF_RANGE');
    }
    normalizedResponses[key] = score;
  }

  return {
    valid: true,
    value: normalizedResponses as Readonly<Record<QuestionKey, SevenPointScore>>,
  };
}

function invalidResponses(
  code: Extract<HealthCheckResponseValidationResult, { valid: false }>['errors'][number]['code'],
): HealthCheckResponseValidationResult {
  return { valid: false, errors: [{ code }] };
}

export function aggregateHealthCheckSnapshot(
  snapshot: unknown,
): AggregateValidationResult {
  if (!isPlainRecord(snapshot)) {
    return invalidAggregate('INVALID_TEMPLATE_VERSION');
  }

  const templateVersion = getOwnDataProperty(snapshot, 'templateVersion');
  if (!templateVersion.found || templateVersion.value !== SQUAD_HEALTH_TEMPLATE_V1.version) {
    return invalidAggregate('INVALID_TEMPLATE_VERSION');
  }

  const expectedRespondentCountProperty = getOwnDataProperty(
    snapshot,
    'expectedRespondentCount',
  );
  if (
    !expectedRespondentCountProperty.found ||
    typeof expectedRespondentCountProperty.value !== 'number' ||
    !Number.isSafeInteger(expectedRespondentCountProperty.value)
  ) {
    return invalidAggregate('INVALID_COUNT');
  }
  const expectedRespondentCount = expectedRespondentCountProperty.value;
  if (expectedRespondentCount < 5) {
    return invalidAggregate('COUNT_BELOW_MINIMUM');
  }

  const questionsProperty = getOwnDataProperty(snapshot, 'questions');
  if (!questionsProperty.found || !isPlainRecord(questionsProperty.value)) {
    return invalidAggregate('MISSING_QUESTION');
  }
  const snapshotQuestions = questionsProperty.value;

  const expectedQuestions = flattenHealthCheckQuestions(SQUAD_HEALTH_TEMPLATE_V1);
  const expectedKeys = new Set(expectedQuestions.map((question) => question.key));
  const snapshotKeys = ownDataPropertyNames(snapshotQuestions);

  if (snapshotKeys === undefined) {
    return invalidAggregate('MISSING_QUESTION');
  }
  if (snapshotKeys.some((key) => !isQuestionKey(key, expectedKeys))) {
    return invalidAggregate('UNKNOWN_QUESTION');
  }

  const normalizedQuestions: Partial<Record<QuestionKey, QuestionAggregateSnapshot>> = {};

  for (const question of expectedQuestions) {
    const aggregateProperty = getOwnDataProperty(snapshotQuestions, question.key);
    if (!aggregateProperty.found || !isPlainRecord(aggregateProperty.value)) {
      return invalidAggregate('MISSING_QUESTION');
    }
    const countProperty = getOwnDataProperty(aggregateProperty.value, 'count');
    const sumProperty = getOwnDataProperty(aggregateProperty.value, 'sum');
    if (
      !countProperty.found ||
      typeof countProperty.value !== 'number' ||
      !Number.isSafeInteger(countProperty.value) ||
      countProperty.value < 0
    ) {
      return invalidAggregate('INVALID_COUNT');
    }
    if (countProperty.value !== expectedRespondentCount) {
      return invalidAggregate('COUNT_MISMATCH');
    }
    if (
      !sumProperty.found ||
      typeof sumProperty.value !== 'number' ||
      !Number.isSafeInteger(sumProperty.value) ||
      sumProperty.value < countProperty.value ||
      sumProperty.value > countProperty.value * 7
    ) {
      return invalidAggregate('INVALID_SUM');
    }
    normalizedQuestions[question.key] = {
      count: countProperty.value,
      sum: sumProperty.value,
    };
  }

  const questions = normalizedQuestions as Readonly<
    Record<QuestionKey, QuestionAggregateSnapshot>
  >;

  const questionAverages = SQUAD_HEALTH_TEMPLATE_V1.areas.flatMap((area) =>
    area.questions.map((question) => ({
      questionKey: question.key,
      areaKey: area.key,
      average: questions[question.key].sum / expectedRespondentCount,
    })),
  );
  const areaAverages = SQUAD_HEALTH_TEMPLATE_V1.areas.map((area) => ({
    areaKey: area.key,
    average:
      area.questions.reduce(
        (sum, question) => sum + questions[question.key].sum,
        0,
      ) /
      (expectedRespondentCount * area.questions.length),
  }));

  return {
    valid: true,
    value: {
      templateVersion: SQUAD_HEALTH_TEMPLATE_V1.version,
      responseCount: expectedRespondentCount,
      questionAverages,
      areaAverages,
    },
  };
}

function invalidAggregate(code: AggregateValidationErrorCode): AggregateValidationResult {
  return { valid: false, errors: [{ code }] };
}

export function presentHealthCheckAggregate(
  aggregate: HealthCheckAggregate,
): HealthCheckAggregate {
  return {
    ...aggregate,
    questionAverages: aggregate.questionAverages.map((question) => ({
      ...question,
      average: roundToOneDecimal(question.average),
    })),
    areaAverages: aggregate.areaAverages.map((area) => ({
      ...area,
      average: roundToOneDecimal(area.average),
    })),
  };
}

function roundToOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function isSevenPointScore(value: unknown): value is SevenPointScore {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 7;
}

function isQuestionKey(
  key: string,
  expectedKeys: ReadonlySet<QuestionKey>,
): key is QuestionKey {
  return expectedKeys.has(key as QuestionKey);
}

function isPlainRecord(value: unknown): value is PlainRecord {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  try {
    if (Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return (
      (prototype === Object.prototype || prototype === null) &&
      ownDataPropertyNames(value as PlainRecord) !== undefined
    );
  } catch {
    return false;
  }
}

function ownDataPropertyNames(record: PlainRecord): string[] | undefined {
  try {
    const keys = Reflect.ownKeys(record);
    if (keys.some((key) => typeof key !== 'string')) {
      return undefined;
    }
    for (const key of keys) {
      if (!getOwnDataProperty(record, key).found) {
        return undefined;
      }
    }
    return keys as string[];
  } catch {
    return undefined;
  }
}

function getOwnDataProperty(record: PlainRecord, key: PropertyKey): OwnDataProperty {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      return { found: false };
    }
    return { found: true, value: descriptor.value };
  } catch {
    return { found: false };
  }
}
