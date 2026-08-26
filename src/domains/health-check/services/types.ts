export type { HealthCheckResponseMap } from '../domain';

export type HealthCheckPhase = 'lobby' | 'collecting' | 'download_pending';
export type HealthCheckRole = 'facilitator' | 'participant';
export type HealthCheckRespondentState = 'in_progress' | 'completed';
export type HealthCheckJobStatus =
  | 'awaiting_materialization'
  | 'processing'
  | 'ready'
  | 'failed';
export type HealthCheckDownloadStatus = HealthCheckJobStatus | 'expired';

export type HealthCheckFailureReason =
  | 'identity'
  | 'rpc'
  | 'malformed'
  | 'forbidden'
  | 'invalid_responses'
  | 'domain_conflict';

export type HealthCheckResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly reason: HealthCheckFailureReason };

export interface HealthCheckState {
  readonly phase: HealthCheckPhase;
  readonly templateVersion: 'squad-health-v1';
  readonly squadName: string;
  readonly measurementDate: string;
  readonly respondentState: HealthCheckRespondentState | null;
  readonly role: HealthCheckRole;
}

export interface HealthCheckProgressRow {
  readonly memberId: string;
  readonly displayName: string;
  readonly status: HealthCheckRespondentState;
}

export interface StartHealthCheckResult {
  readonly status: 'ok';
  readonly phase: 'collecting';
  readonly templateVersion: 'squad-health-v1';
}

export interface SubmitHealthCheckResult {
  readonly status: 'completed';
}

export interface RemoveHealthCheckRespondentResult {
  readonly status: 'removed';
}

export interface AbortHealthCheckResult {
  readonly status: 'aborted';
}

export interface FinalizeHealthCheckResult {
  readonly status: 'download_pending';
  readonly jobId: string;
  readonly jobStatus: HealthCheckDownloadStatus;
  readonly expiresAt: string;
}

export interface HealthCheckDownloadStatusResult {
  readonly status: HealthCheckDownloadStatus;
  readonly filename: string | null;
  readonly expiresAt: string;
}

export interface HealthCheckRpcMap {
  readonly get_health_check_state: {
    readonly args: { readonly p_room_id: string };
  };
  readonly start_health_check: {
    readonly args: { readonly p_room_id: string };
  };
  readonly submit_health_check: {
    readonly args: { readonly p_room_id: string; readonly p_scores: number[] };
  };
  readonly get_health_check_progress: {
    readonly args: { readonly p_room_id: string };
  };
  readonly remove_health_check_respondent: {
    readonly args: { readonly p_room_id: string; readonly p_member_id: string };
  };
  readonly abort_health_check: {
    readonly args: { readonly p_room_id: string };
  };
  readonly finalize_health_check: {
    readonly args: { readonly p_room_id: string };
  };
  readonly get_health_check_download_status: {
    readonly args: { readonly p_job_id: string };
  };
}

export interface HealthCheckRpcError {
  readonly code?: string;
}

export interface HealthCheckRpcPort {
  rpc<Name extends keyof HealthCheckRpcMap>(
    name: Name,
    args: HealthCheckRpcMap[Name]['args'],
  ): Promise<{ readonly data: unknown; readonly error: HealthCheckRpcError | null }>;
}
