import type { HealthCheckFailureReason, HealthCheckPhase } from './types';

export interface CreateHealthCheckRoomInput {
  readonly facilitatorName: string;
  readonly squadName: string;
  readonly measurementDate: string;
  readonly email: string;
  readonly turnstileToken: string;
}

export interface JoinHealthCheckRoomInput {
  readonly name: string;
  readonly code: string;
  readonly turnstileToken: string;
}

export interface HealthCheckRoomMembership {
  readonly roomId: string;
  readonly memberId: string;
  readonly displayName: string;
  readonly role: 'facilitator' | 'participant';
}

export interface HealthCheckRoomActivity {
  readonly activityType: 'health_check';
  readonly phase: HealthCheckPhase;
  readonly templateVersion: 'squad-health-v1';
  readonly squadName: string;
  readonly measurementDate: string;
}

export interface HealthCheckGatewaySnapshot {
  readonly membership: HealthCheckRoomMembership;
  readonly activity: HealthCheckRoomActivity;
  readonly code: string;
}

export type CreateHealthCheckRoomFailureReason = HealthCheckFailureReason
  | 'active_session_exists'
  | 'request_already_used';

export type JoinHealthCheckRoomFailureReason = HealthCheckFailureReason
  | 'session_not_found'
  | 'role_conflict';

export type HealthCheckGatewayResult<Value, Reason extends string> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly reason: Reason };

export interface HealthCheckGateway {
  createHealthCheckRoom(
    input: CreateHealthCheckRoomInput,
  ): Promise<HealthCheckGatewayResult<HealthCheckGatewaySnapshot, CreateHealthCheckRoomFailureReason>>;
  joinHealthCheckRoom(
    input: JoinHealthCheckRoomInput,
  ): Promise<HealthCheckGatewayResult<HealthCheckGatewaySnapshot, JoinHealthCheckRoomFailureReason>>;
}
