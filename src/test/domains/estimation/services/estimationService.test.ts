import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEstimationService,
} from '../../../../domains/estimation/services/estimationService';
import type { RpcClient } from '../../../../platform/supabase/rpcClient';

const SESSION = {
  id: 'session-1', status: 'active', current_round: 1, created_at: '2026-01-01T00:00:00Z',
  join_code: 'ABCD', votes_revealed: false, started: true, consensus_streak: 0,
  activity_type: 'estimation' as const,
};
const LOCAL_PARTICIPANT = {
  participantId: 'participant-1', sessionId: SESSION.id, name: 'Kari', role: 'participant' as const,
};
const ROUND_PARTICIPANT = {
  session_id: SESSION.id, round: 1, participant_id: LOCAL_PARTICIPANT.participantId,
  joined_at: '2026-01-01T00:00:00Z', reestimate_used: false,
};
const VOTE = {
  id: 'vote-1', session_id: SESSION.id, participant_id: LOCAL_PARTICIPANT.participantId, round: 1,
  size: 'm', value: 'gold', created_at: '2026-01-01T00:00:00Z',
};

describe('estimationService', () => {
  const rpc = vi.fn<RpcClient['rpc']>();
  const ensureIdentity = vi.fn<() => Promise<unknown>>();
  const service = createEstimationService({ rpc: { rpc }, ensureIdentity });

  beforeEach(() => {
    vi.clearAllMocks();
    ensureIdentity.mockResolvedValue({ id: 'user-1' });
  });

  it.each([
    ['start', 'start_session'],
    ['reveal', 'reveal_votes'],
    ['next', 'next_round'],
    ['end', 'end_session'],
  ] as const)('%s sender riktig RPC og returnerer validert Session', async (method, rpcName) => {
    rpc.mockResolvedValue({ data: { status: 'ok', session: SESSION }, error: null });

    const result = await service[method](SESSION);

    expect(rpc).toHaveBeenCalledWith(rpcName, { p_session_id: SESSION.id });
    expect(result).toEqual({ ok: true, session: SESSION });
  });

  it('behandler already_revealed som idempotent reveal-suksess', async () => {
    rpc.mockResolvedValue({ data: { status: 'already_revealed', session: SESSION }, error: null });

    await expect(service.reveal(SESSION)).resolves.toEqual({ ok: true, session: SESSION });
  });

  it('avviser already_revealed for andre sessionmutasjoner', async () => {
    rpc.mockResolvedValue({ data: { status: 'already_revealed', session: SESSION }, error: null });

    await expect(service.start(SESSION)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it('claim sender session-ID og returnerer scope-validert RoundParticipant', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok', round_participant: ROUND_PARTICIPANT }, error: null });

    const result = await service.claim(SESSION, LOCAL_PARTICIPANT);

    expect(rpc).toHaveBeenCalledWith('claim_round', { p_session_id: SESSION.id });
    expect(result).toEqual({ ok: true, roundParticipant: ROUND_PARTICIPANT });
  });

  it.each([
    ['session', { session_id: 'other' }],
    ['participant', { participant_id: 'other' }],
    ['round', { round: 2 }],
  ])('claim avviser cross-scope %s', async (_scope, override) => {
    rpc.mockResolvedValue({
      data: { status: 'ok', round_participant: { ...ROUND_PARTICIPANT, ...override } }, error: null,
    });

    await expect(service.claim(SESSION, LOCAL_PARTICIPANT)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it.each(['ok', 'duplicate'] as const)('cast godtar status %s og returnerer scope-validert Vote', async (status) => {
    rpc.mockResolvedValue({ data: { status, vote: VOTE }, error: null });

    const result = await service.cast(SESSION, LOCAL_PARTICIPANT, { size: 'm', value: 'gold' });

    expect(rpc).toHaveBeenCalledWith('cast_vote', {
      p_session_id: SESSION.id, p_round: 1, p_size: 'm', p_value: 'gold',
    });
    expect(result).toEqual({ ok: true, vote: VOTE });
  });

  it.each([
    ['session', { session_id: 'other' }],
    ['participant', { participant_id: 'other' }],
    ['round', { round: 2 }],
  ])('cast avviser cross-scope %s', async (_scope, override) => {
    rpc.mockResolvedValue({ data: { status: 'ok', vote: { ...VOTE, ...override } }, error: null });

    await expect(service.cast(SESSION, LOCAL_PARTICIPANT, { size: 'm', value: 'gold' }))
      .resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it('retract sender session og runde og krever ok-status', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'ok' }, error: null });
    await expect(service.retract(SESSION)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith('retract_vote', { p_session_id: SESSION.id, p_round: 1 });

    rpc.mockResolvedValueOnce({ data: { status: 'duplicate' }, error: null });
    await expect(service.retract(SESSION)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it.each(['start', 'reveal', 'next', 'end', 'claim', 'cast', 'retract'] as const)(
    '%s nekter health session uten identitet eller RPC-kall',
    async (operation) => {
      const healthSession = { ...SESSION, activity_type: 'health_check' as const };
      const run = operation === 'claim'
        ? service.claim(healthSession, LOCAL_PARTICIPANT)
        : operation === 'cast'
          ? service.cast(healthSession, LOCAL_PARTICIPANT, { size: 'm', value: 'gold' })
          : operation === 'retract'
            ? service.retract(healthSession)
            : service[operation](healthSession);

      await expect(run).resolves.toEqual({ ok: false, reason: 'malformed' });
      expect(ensureIdentity).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('avviser mutation response med non-estimation session', async () => {
    rpc.mockResolvedValue({
      data: { status: 'ok', session: { ...SESSION, activity_type: 'health_check' } },
      error: null,
    });

    await expect(service.start(SESSION)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it.each([
    ['session', () => service.start(SESSION), { status: 'ok', session: { ...SESSION, id: 'other' } }],
    ['claim', () => service.claim(SESSION, LOCAL_PARTICIPANT), { status: 'ok', round_participant: {} }],
    ['cast', () => service.cast(SESSION, LOCAL_PARTICIPANT, { size: 'm', value: 'gold' }), { status: 'ok', vote: null }],
  ])('avviser malformed %s-payload', async (_operation, run, data) => {
    rpc.mockResolvedValue({ data, error: null });

    await expect(run()).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it('normaliserer identity- og RPC-feil uten å lekke detaljer', async () => {
    ensureIdentity.mockRejectedValueOnce(new Error('secret identity detail'));
    await expect(service.start(SESSION)).resolves.toEqual({ ok: false, reason: 'identity' });

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'secret DB detail' } });
    await expect(service.start(SESSION)).resolves.toEqual({ ok: false, reason: 'rpc' });

    rpc.mockRejectedValueOnce(new Error('network detail'));
    await expect(service.start(SESSION)).resolves.toEqual({ ok: false, reason: 'rpc' });
  });
});
