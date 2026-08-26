import {
  flattenHealthCheckQuestions,
  SQUAD_HEALTH_TEMPLATE_V1,
  validateHealthCheckResponses,
} from '../domain';
import type { SevenPointScore } from '../domain';
import {
  isUuid,
  parseAbortHealthCheckResult,
  parseFinalizeHealthCheckResult,
  parseHealthCheckProgress,
  parseHealthCheckState,
  parseRemoveHealthCheckRespondentResult,
  parseStartHealthCheckResult,
  parseSubmitHealthCheckResult,
} from './parsers';
import type {
  AbortHealthCheckResult,
  FinalizeHealthCheckResult,
  HealthCheckFailureReason,
  HealthCheckProgressRow,
  HealthCheckResponseMap,
  HealthCheckResult,
  HealthCheckRpcError,
  HealthCheckRpcMap,
  HealthCheckRpcPort,
  HealthCheckState,
  RemoveHealthCheckRespondentResult,
  StartHealthCheckResult,
  SubmitHealthCheckResult,
} from './types';

type RpcSuccess = { readonly data: unknown };
type RpcFailure = { readonly reason: HealthCheckFailureReason };

export interface HealthCheckService {
  getState(roomId: string): Promise<HealthCheckResult<HealthCheckState>>;
  start(roomId: string): Promise<HealthCheckResult<StartHealthCheckResult>>;
  submit(
    roomId: string,
    responses: HealthCheckResponseMap,
  ): Promise<HealthCheckResult<SubmitHealthCheckResult>>;
  getProgress(roomId: string): Promise<HealthCheckResult<readonly HealthCheckProgressRow[]>>;
  removeRespondent(
    roomId: string,
    memberId: string,
  ): Promise<HealthCheckResult<RemoveHealthCheckRespondentResult>>;
  abort(roomId: string): Promise<HealthCheckResult<AbortHealthCheckResult>>;
  finalize(roomId: string): Promise<HealthCheckResult<FinalizeHealthCheckResult>>;
}

export function createHealthCheckService({
  rpc,
  ensureIdentity,
}: {
  readonly rpc: HealthCheckRpcPort;
  readonly ensureIdentity: () => Promise<unknown>;
}): HealthCheckService {
  async function call<Name extends keyof HealthCheckRpcMap>(
    name: Name,
    args: HealthCheckRpcMap[Name]['args'],
  ): Promise<RpcSuccess | RpcFailure> {
    try {
      await ensureIdentity();
    } catch {
      return { reason: 'identity' };
    }

    try {
      const result = await rpc.rpc(name, args);
      return result.error ? { reason: classifyRpcError(result.error) } : { data: result.data };
    } catch {
      return { reason: 'rpc' };
    }
  }

  type RoomOnlyRpcName = Exclude<keyof HealthCheckRpcMap, 'submit_health_check' | 'remove_health_check_respondent'>;

  async function roomCall<Value>(
    name: RoomOnlyRpcName,
    roomId: string,
    parse: (value: unknown) => Value | null,
  ): Promise<HealthCheckResult<Value>> {
    if (!isUuid(roomId)) return { ok: false, reason: 'domain_conflict' };
    const result = await call(name, { p_room_id: roomId });
    if ('reason' in result) return { ok: false, reason: result.reason };
    const value = parse(result.data);
    return value === null
      ? { ok: false, reason: 'malformed' }
      : { ok: true, value };
  }

  return {
    getState: (roomId) => roomCall('get_health_check_state', roomId, parseHealthCheckState),
    start: (roomId) => roomCall('start_health_check', roomId, parseStartHealthCheckResult),

    async submit(roomId, responses) {
      if (!isUuid(roomId)) return { ok: false, reason: 'domain_conflict' };
      const validated = validateHealthCheckResponses(responses);
      if (!validated.valid) return { ok: false, reason: 'invalid_responses' };
      const scores: readonly SevenPointScore[] = flattenHealthCheckQuestions(SQUAD_HEALTH_TEMPLATE_V1)
        .map((question) => validated.value[question.key]);
      const result = await call('submit_health_check', {
        p_room_id: roomId,
        p_scores: [...scores],
      });
      if ('reason' in result) return { ok: false, reason: result.reason };
      const value = parseSubmitHealthCheckResult(result.data);
      return value
        ? { ok: true, value }
        : { ok: false, reason: 'malformed' };
    },

    getProgress: (roomId) => roomCall(
      'get_health_check_progress',
      roomId,
      parseHealthCheckProgress,
    ),

    async removeRespondent(roomId, memberId) {
      if (!isUuid(roomId) || !isUuid(memberId)) {
        return { ok: false, reason: 'domain_conflict' };
      }
      const result = await call('remove_health_check_respondent', {
        p_room_id: roomId,
        p_member_id: memberId,
      });
      if ('reason' in result) return { ok: false, reason: result.reason };
      const value = parseRemoveHealthCheckRespondentResult(result.data);
      return value
        ? { ok: true, value }
        : { ok: false, reason: 'malformed' };
    },

    abort: (roomId) => roomCall('abort_health_check', roomId, parseAbortHealthCheckResult),
    finalize: (roomId) => roomCall(
      'finalize_health_check',
      roomId,
      parseFinalizeHealthCheckResult,
    ),
  };
}

function classifyRpcError(error: HealthCheckRpcError): HealthCheckFailureReason {
  if (error.code === '28000') return 'identity';
  if (error.code === '42501') return 'forbidden';
  if (error.code === '22023') return 'domain_conflict';
  return 'rpc';
}
