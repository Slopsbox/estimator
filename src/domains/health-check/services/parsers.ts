import type {
  AbortHealthCheckResult,
  FinalizeHealthCheckResult,
  HealthCheckDownloadStatus,
  HealthCheckDownloadStatusResult,
  HealthCheckJobStatus,
  HealthCheckProgressRow,
  HealthCheckState,
  RemoveHealthCheckRespondentResult,
  StartHealthCheckResult,
  SubmitHealthCheckResult,
} from './types';

type PlainRecord = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function parseHealthCheckState(value: unknown): HealthCheckState | null {
  const record = exactRecord(value, [
    'phase',
    'template_version',
    'squad_name',
    'measurement_date',
    'respondent_state',
    'role',
  ]);
  if (!record) return null;

  const phase = dataValue(record, 'phase');
  const templateVersion = dataValue(record, 'template_version');
  const squadName = dataValue(record, 'squad_name');
  const measurementDate = dataValue(record, 'measurement_date');
  const respondentState = dataValue(record, 'respondent_state');
  const role = dataValue(record, 'role');

  if (
    (phase !== 'lobby' && phase !== 'collecting' && phase !== 'download_pending')
    || templateVersion !== 'squad-health-v1'
    || !isSafeName(squadName)
    || !isIsoDate(measurementDate)
    || (respondentState !== null
      && respondentState !== 'in_progress'
      && respondentState !== 'completed')
    || (role !== 'facilitator' && role !== 'participant')
  ) return null;

  if (role === 'facilitator' && respondentState !== null) return null;
  if (phase === 'lobby' && respondentState !== null) return null;
  if (role === 'participant' && phase === 'collecting' && respondentState === null) return null;
  if (role === 'participant' && phase === 'download_pending' && respondentState !== 'completed') {
    return null;
  }

  return {
    phase,
    templateVersion,
    squadName,
    measurementDate,
    respondentState,
    role,
  };
}

export function parseStartHealthCheckResult(value: unknown): StartHealthCheckResult | null {
  const record = exactRecord(value, ['status', 'phase', 'template_version']);
  if (
    !record
    || dataValue(record, 'status') !== 'ok'
    || dataValue(record, 'phase') !== 'collecting'
    || dataValue(record, 'template_version') !== 'squad-health-v1'
  ) return null;

  return { status: 'ok', phase: 'collecting', templateVersion: 'squad-health-v1' };
}

export function parseSubmitHealthCheckResult(value: unknown): SubmitHealthCheckResult | null {
  return hasExactStatus(value, 'completed') ? { status: 'completed' } : null;
}

export function parseHealthCheckProgress(value: unknown): readonly HealthCheckProgressRow[] | null {
  const entries = arrayDataValues(value);
  if (!entries) return null;

  const progress: HealthCheckProgressRow[] = [];
  for (const entry of entries) {
    const record = exactRecord(entry, ['member_id', 'display_name', 'status']);
    if (!record) return null;
    const memberId = dataValue(record, 'member_id');
    const displayName = dataValue(record, 'display_name');
    const status = dataValue(record, 'status');
    if (
      !isUuid(memberId)
      || !isSafeName(displayName)
      || (status !== 'in_progress' && status !== 'completed')
    ) return null;
    progress.push({ memberId, displayName, status });
  }
  return progress;
}

export function parseRemoveHealthCheckRespondentResult(
  value: unknown,
): RemoveHealthCheckRespondentResult | null {
  return hasExactStatus(value, 'removed') ? { status: 'removed' } : null;
}

export function parseAbortHealthCheckResult(value: unknown): AbortHealthCheckResult | null {
  return hasExactStatus(value, 'aborted') ? { status: 'aborted' } : null;
}

export function parseFinalizeHealthCheckResult(value: unknown): FinalizeHealthCheckResult | null {
  const record = exactRecord(value, ['status', 'job_id', 'job_status']);
  if (!record || dataValue(record, 'status') !== 'download_pending') return null;
  const jobId = dataValue(record, 'job_id');
  const jobStatus = dataValue(record, 'job_status');
  if (!isUuid(jobId) || !isDownloadStatus(jobStatus)) return null;
  return { status: 'download_pending', jobId, jobStatus };
}

export function parseHealthCheckDownloadStatus(
  value: unknown,
): HealthCheckDownloadStatusResult | null {
  const record = exactRecord(value, ['status', 'filename']);
  if (!record) return null;
  const status = dataValue(record, 'status');
  const filename = dataValue(record, 'filename');
  if (!isDownloadStatus(status) || (filename !== null && !isSafeHealthReportFilename(filename))) {
    return null;
  }
  if ((status === 'ready') !== (filename !== null)) return null;
  return { status, filename };
}

function hasExactStatus(value: unknown, status: string): boolean {
  const record = exactRecord(value, ['status']);
  return record !== null && dataValue(record, 'status') === status;
}

function isJobStatus(value: unknown): value is HealthCheckJobStatus {
  return value === 'awaiting_materialization'
    || value === 'processing'
    || value === 'ready'
    || value === 'failed';
}

function isDownloadStatus(value: unknown): value is HealthCheckDownloadStatus {
  return value === 'expired' || isJobStatus(value);
}

export function isSafeHealthReportFilename(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && Array.from(value).length >= 5
    && Array.from(value).length <= 180
    && value.toLowerCase().endsWith('.zip')
    && !value.includes('/')
    && !value.includes('\\')
    && !/[\p{Cc}\p{Cf}]/u.test(value);
}

function isSafeName(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && Array.from(value).length > 0
    && Array.from(value).length <= 80
    && !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    });
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): PlainRecord | null {
  if (!isPlainRecord(value)) return null;
  const keys = ownDataKeys(value);
  if (
    !keys
    || keys.length !== expectedKeys.length
    || expectedKeys.some((key) => !keys.includes(key))
  ) return null;
  return value;
}

function isPlainRecord(value: unknown): value is PlainRecord {
  if (value === null || typeof value !== 'object') return false;
  try {
    if (Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function ownDataKeys(record: PlainRecord): string[] | null {
  try {
    const keys = Reflect.ownKeys(record);
    const stringKeys: string[] = [];
    for (const key of keys) {
      if (typeof key !== 'string') return null;
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
      stringKeys.push(key);
    }
    return stringKeys;
  } catch {
    return null;
  }
}

function dataValue(record: PlainRecord, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function arrayDataValues(value: unknown): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !lengthDescriptor
      || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
      || typeof lengthDescriptor.value !== 'number'
    ) return null;
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === 'symbol')) return null;
    const expectedKeys = Array.from({ length }, (_, index) => String(index));
    const stringKeys = keys.filter((key): key is string => typeof key === 'string');
    if (
      stringKeys.length !== expectedKeys.length + 1
      || !stringKeys.includes('length')
      || expectedKeys.some((key) => !stringKeys.includes(key))
    ) return null;
    const entries: unknown[] = [];
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
      entries.push(descriptor.value);
    }
    return entries;
  } catch {
    return null;
  }
}
