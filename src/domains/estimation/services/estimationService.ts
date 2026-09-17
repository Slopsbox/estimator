import type { LocalParticipant, Session, VoteSubmission } from '../../../lib/types';
import { isRecord, parseRoundParticipant, parseSession, parseVote } from '../../../platform/supabase/rpcRowParsers';
import { isExpiredJwtError, type RpcClient } from '../../../platform/supabase/rpcClient';

export type EstimationRpcClient = RpcClient;

type FailureReason = 'identity' | 'rpc' | 'malformed';
type SessionResult = { ok: true; session: Session } | { ok: false; reason: FailureReason };

export function createEstimationService({
  rpc,
  ensureIdentity,
}: {
  rpc: EstimationRpcClient;
  ensureIdentity: () => Promise<unknown>;
}) {
  async function call<Name extends keyof import('../../../lib/database.types').Database['public']['Functions']>(
    name: Name,
    args: import('../../../lib/database.types').Database['public']['Functions'][Name]['Args'],
  ): Promise<{ data: unknown } | { reason: FailureReason }> {
    try {
      await ensureIdentity();
    } catch {
      return { reason: 'identity' };
    }
    try {
      const result = await rpc.rpc(name, args);
      return result.error
        ? { reason: isExpiredJwtError(result.error) ? 'identity' : 'rpc' }
        : { data: result.data };
    } catch {
      return { reason: 'rpc' };
    }
  }

  async function sessionMutation(
    name: 'start_session' | 'reveal_votes' | 'next_round' | 'end_session',
    currentSession: Session,
  ): Promise<SessionResult> {
    if (currentSession.activity_type !== 'estimation') return { ok: false, reason: 'malformed' };
    const result = await call(name, { p_session_id: currentSession.id });
    if ('reason' in result) return { ok: false, reason: result.reason };
    if (!isRecord(result.data)) return { ok: false, reason: 'malformed' };
    const validStatus = result.data.status === 'ok'
      || (name === 'reveal_votes' && result.data.status === 'already_revealed');
    const session = validStatus ? parseSession(result.data.session) : null;
    return session?.id === currentSession.id && session.activity_type === 'estimation'
      ? { ok: true, session }
      : { ok: false, reason: 'malformed' };
  }

  return {
    start: (session: Session) => sessionMutation('start_session', session),
    reveal: (session: Session) => sessionMutation('reveal_votes', session),
    next: (session: Session) => sessionMutation('next_round', session),
    async end(session: Session) {
      const result = await sessionMutation('end_session', session);
      return !result.ok && result.reason === 'rpc'
        ? sessionMutation('end_session', session)
        : result;
    },

    async claim(session: Session, participant: LocalParticipant) {
      if (session.activity_type !== 'estimation') return { ok: false as const, reason: 'malformed' as const };
      const result = await call('claim_round', { p_session_id: session.id });
      if ('reason' in result) return { ok: false as const, reason: result.reason };
      const roundParticipant = isRecord(result.data) && result.data.status === 'ok'
        ? parseRoundParticipant(result.data.round_participant)
        : null;
      return roundParticipant
        && roundParticipant.session_id === session.id
        && roundParticipant.participant_id === participant.participantId
        && roundParticipant.round === session.current_round
        ? { ok: true as const, roundParticipant }
        : { ok: false as const, reason: 'malformed' as const };
    },

    async cast(session: Session, participant: LocalParticipant, vote: VoteSubmission) {
      if (session.activity_type !== 'estimation') return { ok: false as const, reason: 'malformed' as const };
      const result = await call('cast_vote', {
        p_session_id: session.id,
        p_round: session.current_round,
        p_size: vote.size,
        p_value: vote.value,
      });
      if ('reason' in result) return { ok: false as const, reason: result.reason };
      const returnedVote = isRecord(result.data)
        && (result.data.status === 'ok' || result.data.status === 'duplicate')
        ? parseVote(result.data.vote)
        : null;
      return returnedVote
        && returnedVote.session_id === session.id
        && returnedVote.participant_id === participant.participantId
        && returnedVote.round === session.current_round
        ? { ok: true as const, vote: returnedVote }
        : { ok: false as const, reason: 'malformed' as const };
    },

    async retract(session: Session) {
      if (session.activity_type !== 'estimation') return { ok: false as const, reason: 'malformed' as const };
      const result = await call('retract_vote', {
        p_session_id: session.id,
        p_round: session.current_round,
      });
      if ('reason' in result) return { ok: false as const, reason: result.reason };
      return isRecord(result.data) && result.data.status === 'ok'
        ? { ok: true as const }
        : { ok: false as const, reason: 'malformed' as const };
    },
  };
}

export type EstimationService = ReturnType<typeof createEstimationService>;
