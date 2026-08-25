import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRoomMembershipService,
  type RoomMembershipStorage,
} from '../../../rooms/services/roomMembershipService';
import type { RpcClient } from '../../../platform/supabase/rpcClient';

const SESSION = {
  id: 'session-1', status: 'active', current_round: 1, created_at: '2026-01-01T00:00:00Z',
  join_code: 'ABCD', votes_revealed: false, started: true, consensus_streak: 0,
};
const PARTICIPANT = {
  id: 'participant-1', session_id: SESSION.id, name: 'Kari', role: 'participant',
  joined_at: '2026-01-01T00:00:00Z', left_at: null,
};
const ROUND_PARTICIPANT = {
  session_id: SESSION.id, round: 1, participant_id: PARTICIPANT.id,
  joined_at: '2026-01-01T00:00:00Z', reestimate_used: false,
};
const VOTE = {
  id: 'vote-1', session_id: SESSION.id, participant_id: PARTICIPANT.id, round: 1,
  size: 'm', value: 'gold', created_at: '2026-01-01T00:00:00Z',
};

function membership(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ok', session: SESSION, participant: PARTICIPANT,
    round_participant: ROUND_PARTICIPANT, ...overrides,
  };
}

describe('roomMembershipService', () => {
  const rpc = vi.fn<RpcClient['rpc']>();
  const ensureIdentity = vi.fn<() => Promise<unknown>>();
  const storage: RoomMembershipStorage = {
    writeSessionPointer: vi.fn(),
    clearCreateRequestId: vi.fn(),
    writeLastUsedName: vi.fn(),
  };
  const service = createRoomMembershipService({ rpc: { rpc }, ensureIdentity, storage });

  beforeEach(() => {
    vi.clearAllMocks();
    ensureIdentity.mockResolvedValue({ id: 'user-1' });
  });

  it('trimmer create-navn og aksepterer idempotent active_session_exists', async () => {
    rpc.mockResolvedValue({ data: membership({ status: 'active_session_exists' }), error: null });

    const result = await service.create('  Ola  ', 'request-1');

    expect(rpc).toHaveBeenCalledWith('create_session', {
      p_request_id: 'request-1', p_facilitator_name: 'Ola',
    });
    expect(result).toMatchObject({ ok: true, snapshot: { activityType: 'estimation' } });
  });

  it('trimmer og uppercaser join-argumenter', async () => {
    rpc.mockResolvedValue({ data: membership(), error: null });

    const result = await service.join(' abcd ', '  Kari  ');

    expect(rpc).toHaveBeenCalledWith('join_session', { p_join_code: 'ABCD', p_name: 'Kari' });
    expect(result).toMatchObject({ ok: true, snapshot: { localParticipant: { name: 'Kari' } } });
  });

  it.each(['session_not_found', 'role_conflict'] as const)('returnerer join-status %s uten DB-feil', async (status) => {
    rpc.mockResolvedValue({ data: { status }, error: null });

    await expect(service.join('ABCD', 'Kari')).resolves.toEqual({ ok: false, reason: status });
  });

  it.each([
    ['manglende type', {}, 'estimation'],
    ['envelope', { activity_type: 'health_check' }, 'health_check'],
    ['session', { session: { ...SESSION, activity_type: 'health_check' } }, 'health_check'],
  ])('tolker activity type fra %s', async (_scenario, overrides, expected) => {
    rpc.mockResolvedValue({ data: membership(overrides), error: null });

    const result = await service.join('ABCD', 'Kari');

    expect(result).toMatchObject({ ok: true, snapshot: { activityType: expected } });
  });

  it.each([
    ['konflikt', { activity_type: 'estimation', session: { ...SESSION, activity_type: 'health_check' } }],
    ['ukjent envelope', { activity_type: 'retro' }],
    ['ukjent session', { session: { ...SESSION, activity_type: 'retro' } }],
  ])('avviser activity type ved %s', async (_scenario, overrides) => {
    rpc.mockResolvedValue({ data: membership(overrides), error: null });

    await expect(service.join('ABCD', 'Kari')).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it.each([
    ['participant', { participant: { ...PARTICIPANT, session_id: 'other' } }],
    ['round session', { round_participant: { ...ROUND_PARTICIPANT, session_id: 'other' } }],
    ['round participant', { round_participant: { ...ROUND_PARTICIPANT, participant_id: 'other' } }],
    ['round number', { round_participant: { ...ROUND_PARTICIPANT, round: 2 } }],
  ])('avviser cross-scope %s', async (_scenario, overrides) => {
    rpc.mockResolvedValue({ data: membership(overrides), error: null });

    await expect(service.join('ABCD', 'Kari')).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it('restore validerer legacy ownVote-scope og returnerer hele snapshotet', async () => {
    rpc.mockResolvedValue({ data: membership({ vote: VOTE, activity_type: 'health_check' }), error: null });

    const result = await service.restore(SESSION.id);

    expect(rpc).toHaveBeenCalledWith('restore_session', { p_session_id: SESSION.id });
    expect(result).toEqual({
      ok: true,
      snapshot: {
        session: SESSION,
        participant: PARTICIPANT,
        localParticipant: {
          participantId: PARTICIPANT.id, sessionId: SESSION.id, name: 'Kari', role: 'participant',
        },
        pointer: {
          version: 2, activityType: 'health_check', participantId: PARTICIPANT.id,
          sessionId: SESSION.id, name: 'Kari', role: 'participant',
        },
        activityType: 'health_check', ownVote: VOTE, roundParticipant: ROUND_PARTICIPANT,
      },
    });
  });

  it('bevarer legacy-toleranse for malformed valgfri vote, men avviser cross-scope', async () => {
    rpc.mockResolvedValueOnce({ data: membership({ vote: { ...VOTE, size: 'xxl' } }), error: null });
    await expect(service.restore(SESSION.id)).resolves.toMatchObject({
      ok: true, snapshot: { ownVote: null },
    });

    rpc.mockResolvedValueOnce({ data: membership({ vote: { ...VOTE, participant_id: 'other' } }), error: null });
    await expect(service.restore(SESSION.id)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it.each(['membership_missing', 'session_completed'] as const)('returnerer restore-status %s', async (status) => {
    rpc.mockResolvedValue({ data: { status }, error: null });

    await expect(service.restore(SESSION.id)).resolves.toEqual({ ok: false, reason: status });
  });

  it('skiller identity-, RPC- og malformed-feil uten å lekke feilobjektet', async () => {
    ensureIdentity.mockRejectedValueOnce(new Error('secret identity detail'));
    await expect(service.join('ABCD', 'Kari')).resolves.toEqual({ ok: false, reason: 'identity' });

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'secret DB detail' } });
    await expect(service.join('ABCD', 'Kari')).resolves.toEqual({ ok: false, reason: 'rpc' });

    rpc.mockResolvedValueOnce({ data: { status: 'ok', session: {} }, error: null });
    await expect(service.join('ABCD', 'Kari')).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it('leave validerer status og normaliserer feil', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'ok' }, error: null });
    await expect(service.leave(SESSION.id)).resolves.toEqual({ ok: true });

    rpc.mockResolvedValueOnce({ data: { status: 'membership_missing' }, error: null });
    await expect(service.leave(SESSION.id)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it('muterer ikke storage før provider eksplisitt persisterer et current resultat', async () => {
    rpc.mockResolvedValue({ data: membership(), error: null });

    const result = await service.create('Ola', 'request-1');

    expect(storage.writeSessionPointer).not.toHaveBeenCalled();
    expect(storage.clearCreateRequestId).not.toHaveBeenCalled();
    expect(storage.writeLastUsedName).not.toHaveBeenCalled();
    if (!result.ok) throw new Error('Expected success');

    service.persist(result.snapshot, { clearCreateRequestId: true, rememberName: true });
    expect(storage.writeSessionPointer).toHaveBeenCalledWith(result.snapshot.pointer);
    expect(storage.clearCreateRequestId).toHaveBeenCalledOnce();
    expect(storage.writeLastUsedName).toHaveBeenCalledWith('Kari');
  });
});
