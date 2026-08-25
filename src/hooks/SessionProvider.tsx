import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  clearCreateRequestId,
  clearSessionPointer,
  getOrCreateCreateRequestId,
  readSessionPointer,
  writeLastUsedName,
  writeSessionPointer,
} from '../lib/localStorage';
import { ensureAnonymousIdentity, supabase } from '../lib/supabase';
import type {
  LocalParticipant,
  Participant,
  ParticipantRole,
  RoundParticipant,
  Session,
  SessionPointer,
  Size,
  Value,
  Vote,
  VoteSubmission,
} from '../lib/types';
import { SessionContext, type ConnectionState, type JoinResult, type MutationResult, type RestoreStatus, type SessionContextValue } from './sessionContext';

const GENERIC_RESTORE_ERROR = 'Kunne ikke koble til sesjonen. Vi prøver igjen.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isRole(value: unknown): value is ParticipantRole {
  return value === 'facilitator' || value === 'participant';
}

function isSize(value: unknown): value is Size {
  return value === 'xs' || value === 's' || value === 'm' || value === 'l' || value === 'xl';
}

function isValue(value: unknown): value is Value {
  return value === 'gold' || value === 'silver' || value === 'bronze';
}

function parseSession(value: unknown): Session | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' || typeof value.created_at !== 'string'
    || typeof value.current_round !== 'number' || !isNullableString(value.join_code)
    || typeof value.started !== 'boolean' || typeof value.status !== 'string'
    || typeof value.votes_revealed !== 'boolean' || typeof value.consensus_streak !== 'number'
  ) return null;
  return {
    id: value.id,
    created_at: value.created_at,
    current_round: value.current_round,
    join_code: value.join_code,
    started: value.started,
    status: value.status,
    votes_revealed: value.votes_revealed,
    consensus_streak: value.consensus_streak,
  };
}

function parseParticipant(value: unknown): Participant | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' || typeof value.joined_at !== 'string'
    || typeof value.name !== 'string' || !isRole(value.role)
    || typeof value.session_id !== 'string' || !isNullableString(value.left_at)
  ) return null;
  return {
    id: value.id,
    joined_at: value.joined_at,
    name: value.name,
    role: value.role,
    session_id: value.session_id,
    left_at: value.left_at,
  };
}

function parseVote(value: unknown): Vote | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' || typeof value.created_at !== 'string'
    || typeof value.participant_id !== 'string' || typeof value.round !== 'number'
    || typeof value.session_id !== 'string' || !isSize(value.size) || !isValue(value.value)
  ) return null;
  return {
    id: value.id,
    created_at: value.created_at,
    participant_id: value.participant_id,
    round: value.round,
    session_id: value.session_id,
    size: value.size,
    value: value.value,
  };
}

function parseRoundParticipant(value: unknown): RoundParticipant | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return null;
  if (
    typeof value.joined_at !== 'string' || typeof value.participant_id !== 'string'
    || typeof value.reestimate_used !== 'boolean' || typeof value.round !== 'number'
    || typeof value.session_id !== 'string'
  ) return null;
  return {
    joined_at: value.joined_at,
    participant_id: value.participant_id,
    reestimate_used: value.reestimate_used,
    round: value.round,
    session_id: value.session_id,
  };
}

function localFromParticipant(participant: Participant): LocalParticipant {
  return {
    participantId: participant.id,
    sessionId: participant.session_id,
    name: participant.name,
    role: participant.role as ParticipantRole,
  };
}

function pointerFromParticipant(participant: Participant): SessionPointer {
  return { version: 1, ...localFromParticipant(participant) };
}

function parseMembershipPayload(value: unknown) {
  if (!isRecord(value) || (value.status !== 'ok' && value.status !== 'active_session_exists')) return null;
  const session = parseSession(value.session);
  const participant = parseParticipant(value.participant);
  const roundParticipant = parseRoundParticipant(value.round_participant);
  if (!session || !participant || participant.session_id !== session.id) return null;
  if (roundParticipant && (
    roundParticipant.session_id !== session.id
    || roundParticipant.participant_id !== participant.id
    || roundParticipant.round !== session.current_round
  )) return null;
  return { session, participant, roundParticipant };
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [pointer, setPointer] = useState<SessionPointer | null>(readSessionPointer);
  const [session, setSession] = useState<Session | null>(null);
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(() => {
    const initial = readSessionPointer();
    if (!initial) return null;
    return {
      participantId: initial.participantId,
      sessionId: initial.sessionId,
      name: initial.name,
      role: initial.role,
    };
  });
  const [ownVote, setOwnVote] = useState<Vote | null>(null);
  const [roundParticipant, setRoundParticipant] = useState<RoundParticipant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>(pointer ? 'initializing' : 'ready');
  const [connectionState, setConnectionState] = useState<ConnectionState>(pointer ? 'connecting' : 'idle');
  const [restoreTrigger, setRestoreTrigger] = useState(0);
  const generationRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreInFlightRef = useRef<Promise<void> | null>(null);
  const restoreRequestedRef = useRef(false);

  const clearAppSession = useCallback((status: RestoreStatus = 'ready') => {
    generationRef.current += 1;
    restoreRequestedRef.current = false;
    clearSessionPointer();
    setPointer(null);
    setSession(null);
    setLocalParticipant(null);
    setOwnVote(null);
    setRoundParticipant(null);
    setRestoreStatus(status);
    setConnectionState('idle');
    setError(null);
  }, []);

  const restore = useCallback(async () => {
    const activePointer = readSessionPointer();
    if (!activePointer) {
      setRestoreStatus('ready');
      setConnectionState('idle');
      return;
    }
    if (restoreInFlightRef.current) {
      restoreRequestedRef.current = true;
      return restoreInFlightRef.current;
    }
    const generation = generationRef.current;
    const attempt = (async () => {
      setConnectionState('connecting');
      try {
        await ensureAnonymousIdentity();
        const result = await supabase.rpc('restore_session', { p_session_id: activePointer.sessionId });
        if (generation !== generationRef.current) return;
        if (result.error || !isRecord(result.data)) throw new Error('restore_failed');
        if (result.data.status === 'membership_missing' || result.data.status === 'session_completed') {
          clearAppSession('invalid');
          return;
        }
        const payload = parseMembershipPayload(result.data);
        if (!payload) throw new Error('invalid_restore_payload');
        const vote = parseVote(result.data.vote);
        if (vote && (
          vote.session_id !== payload.session.id
          || vote.participant_id !== payload.participant.id
          || vote.round !== payload.session.current_round
        )) throw new Error('invalid_restore_vote_scope');
        const authoritativePointer = pointerFromParticipant(payload.participant);
        writeSessionPointer(authoritativePointer);
        setPointer(authoritativePointer);
        setSession(payload.session);
        setLocalParticipant(localFromParticipant(payload.participant));
        setOwnVote(vote);
        setRoundParticipant(payload.roundParticipant);
        setError(null);
        setRestoreStatus('ready');
        setConnectionState('connected');
      } catch {
        if (generation !== generationRef.current) return;
        setError(GENERIC_RESTORE_ERROR);
        setRestoreStatus('reconnecting');
        setConnectionState('disconnected');
      }
    })().finally(() => {
      if (restoreInFlightRef.current === attempt) restoreInFlightRef.current = null;
      const latestPointer = readSessionPointer();
      const shouldRestoreAgain = restoreRequestedRef.current
        && generation === generationRef.current
        && latestPointer?.sessionId === activePointer.sessionId
        && latestPointer.participantId === activePointer.participantId;
      restoreRequestedRef.current = false;
      if (shouldRestoreAgain) setRestoreTrigger((current) => current + 1);
    });
    restoreInFlightRef.current = attempt;
    return attempt;
  }, [clearAppSession]);

  useEffect(() => {
    if (!pointer?.sessionId) return;
    queueMicrotask(() => { void restore(); });
  }, [pointer?.sessionId, restore, restoreTrigger]);

  useEffect(() => {
    const handleRetry = () => {
      if (document.visibilityState === 'visible' || navigator.onLine) void restore();
    };
    window.addEventListener('online', handleRetry);
    document.addEventListener('visibilitychange', handleRetry);
    return () => {
      window.removeEventListener('online', handleRetry);
      document.removeEventListener('visibilitychange', handleRetry);
    };
  }, [restore]);

  useEffect(() => {
    const sessionId = pointer?.sessionId;
    if (!sessionId) return;
    const generation = generationRef.current;
    let active = true;
    let firstSubscription = true;
    let channel: RealtimeChannel;
    const connect = () => {
      if (!active || generation !== generationRef.current) return;
      setConnectionState('connecting');
      channel = supabase
        .channel(`session-watch:${sessionId}:${generation}`, { config: { private: true } })
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}`,
        }, () => {
          if (active && generation === generationRef.current) void restore();
        })
        .subscribe((status) => {
          if (!active || generation !== generationRef.current) return;
          if (status === 'SUBSCRIBED') {
            setConnectionState('connected');
            if (firstSubscription) {
              firstSubscription = false;
            } else {
              void restore();
            }
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConnectionState('disconnected');
            setRestoreStatus((current) => current === 'initializing' ? 'reconnecting' : current);
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(() => {
              if (!active || generation !== generationRef.current) return;
              void supabase.removeChannel(channel);
              connect();
            }, 2000);
          }
        });
    };
    connect();
    return () => {
      active = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [pointer?.sessionId, restore]);

  const applyMembership = useCallback((payload: ReturnType<typeof parseMembershipPayload>) => {
    if (!payload) return false;
    const authoritativePointer = pointerFromParticipant(payload.participant);
    writeSessionPointer(authoritativePointer);
    setPointer(authoritativePointer);
    setSession(payload.session);
    setLocalParticipant(localFromParticipant(payload.participant));
    setOwnVote(null);
    setRoundParticipant(payload.roundParticipant);
    setRestoreStatus('ready');
    setError(null);
    return true;
  }, []);

  const createSession = useCallback(async (name: string): Promise<Session | null> => {
    const generation = ++generationRef.current;
    setPointer(null);
    setLoading(true);
    setError(null);
    try {
      await ensureAnonymousIdentity();
      const requestId = getOrCreateCreateRequestId();
      const result = await supabase.rpc('create_session', {
        p_request_id: requestId,
        p_facilitator_name: name.trim(),
      });
      if (generation !== generationRef.current) return null;
      const payload = result.error ? null : parseMembershipPayload(result.data);
      if (!payload || !applyMembership(payload)) throw new Error('create_failed');
      clearCreateRequestId();
      return payload.session;
    } catch {
      if (generation === generationRef.current) setError('Kunne ikke opprette sesjon. Prøv igjen.');
      return null;
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [applyMembership]);

  const joinSession = useCallback(async (code: string, name: string): Promise<JoinResult> => {
    const generation = ++generationRef.current;
    setPointer(null);
    setLoading(true);
    setError(null);
    try {
      await ensureAnonymousIdentity();
      const result = await supabase.rpc('join_session', {
        p_join_code: code.trim().toUpperCase(),
        p_name: name.trim(),
      });
      if (generation !== generationRef.current) return { ok: false, reason: 'transient' };
      if (result.error || !isRecord(result.data)) throw new Error('join_failed');
      if (result.data.status === 'session_not_found') return { ok: false, reason: 'session_not_found' };
      if (result.data.status === 'role_conflict') return { ok: false, reason: 'role_conflict' };
      const payload = parseMembershipPayload(result.data);
      if (!payload || !applyMembership(payload)) throw new Error('invalid_join_payload');
      writeLastUsedName(payload.participant.name);
      return { ok: true };
    } catch {
      if (generation === generationRef.current) setError('Kunne ikke koble til sesjonen. Prøv igjen.');
      return { ok: false, reason: 'transient' };
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [applyMembership]);

  const sessionMutation = useCallback(async (
    rpc: 'start_session' | 'reveal_votes' | 'next_round' | 'end_session',
    message: string,
  ): Promise<MutationResult> => {
    if (!session) return { ok: false, message: 'Ingen aktiv sesjon.' };
    setError(null);
    const generation = generationRef.current;
    try {
      await ensureAnonymousIdentity();
      const result = await supabase.rpc(rpc, { p_session_id: session.id });
      if (generation !== generationRef.current || result.error || !isRecord(result.data)) throw new Error('mutation_failed');
      const validStatus = result.data.status === 'ok'
        || (rpc === 'reveal_votes' && result.data.status === 'already_revealed');
      if (!validStatus) throw new Error('invalid_mutation_payload');
      const updated = parseSession(result.data.session);
      if (!updated || updated.id !== session.id) throw new Error('invalid_mutation_session');
      setSession(updated);
      return { ok: true };
    } catch {
      if (generation === generationRef.current) setError(message);
      return { ok: false, message };
    }
  }, [session]);

  const startSession = useCallback(() => sessionMutation('start_session', 'Kunne ikke starte sesjonen. Prøv igjen.'), [sessionMutation]);
  const revealVotes = useCallback(() => sessionMutation('reveal_votes', 'Kunne ikke avsløre stemmer. Prøv igjen.'), [sessionMutation]);
  const nextRound = useCallback(() => sessionMutation('next_round', 'Kunne ikke starte ny runde. Prøv igjen.'), [sessionMutation]);
  const endSession = useCallback(() => sessionMutation('end_session', 'Kunne ikke avslutte sesjonen. Prøv igjen.'), [sessionMutation]);

  const leaveSession = useCallback(async (): Promise<MutationResult> => {
    if (!session) return { ok: false, message: 'Ingen aktiv sesjon.' };
    const generation = generationRef.current;
    try {
      await ensureAnonymousIdentity();
      const result = await supabase.rpc('leave_session', { p_session_id: session.id });
      if (generation !== generationRef.current || result.error || !isRecord(result.data) || result.data.status !== 'ok') {
        throw new Error('leave_failed');
      }
      clearAppSession('ready');
      return { ok: true };
    } catch {
      const message = 'Kunne ikke forlate sesjonen. Prøv igjen.';
      if (generation === generationRef.current) setError(message);
      return { ok: false, message };
    }
  }, [clearAppSession, session]);

  const claimRound = useCallback(async (): Promise<MutationResult> => {
    if (!session || !localParticipant) return { ok: false, message: 'Ingen aktiv sesjon.' };
    const generation = generationRef.current;
    try {
      await ensureAnonymousIdentity();
    } catch {
      return { ok: false, message: 'Kunne ikke klargjøre runden. Prøv igjen.' };
    }
    const result = await supabase.rpc('claim_round', { p_session_id: session.id });
    if (generation !== generationRef.current) return { ok: false, message: 'Sesjonen er ikke lenger aktiv.' };
    const payload = !result.error && isRecord(result.data) && result.data.status === 'ok'
      ? parseRoundParticipant(result.data.round_participant) : null;
    if (!payload || payload.session_id !== session.id || payload.round !== session.current_round
      || payload.participant_id !== localParticipant.participantId) {
      return { ok: false, message: 'Kunne ikke klargjøre runden. Prøv igjen.' };
    }
    setRoundParticipant(payload);
    return { ok: true };
  }, [localParticipant, session]);

  const castVote = useCallback(async (vote: VoteSubmission): Promise<MutationResult> => {
    if (!session || !localParticipant || !roundParticipant) return { ok: false, message: 'Ingen aktiv sesjon.' };
    const generation = generationRef.current;
    try {
      await ensureAnonymousIdentity();
    } catch {
      return { ok: false, message: 'Kunne ikke registrere stemme. Prøv igjen.' };
    }
    const result = await supabase.rpc('cast_vote', {
      p_session_id: session.id,
      p_round: session.current_round,
      p_size: vote.size,
      p_value: vote.value,
    });
    const returnedVote = !result.error && isRecord(result.data)
      && (result.data.status === 'ok' || result.data.status === 'duplicate')
      ? parseVote(result.data.vote) : null;
    if (generation !== generationRef.current) return { ok: false, message: 'Sesjonen er ikke lenger aktiv.' };
    if (!returnedVote || returnedVote.session_id !== session.id
      || returnedVote.participant_id !== localParticipant.participantId
      || returnedVote.round !== session.current_round) {
      void restore();
      return { ok: false, message: 'Kunne ikke registrere stemme. Prøv igjen.' };
    }
    setOwnVote(returnedVote);
    return { ok: true };
  }, [localParticipant, restore, roundParticipant, session]);

  const retractVote = useCallback(async (): Promise<MutationResult> => {
    if (!session || !roundParticipant) return { ok: false, message: 'Ingen aktiv stemme.' };
    const generation = generationRef.current;
    try {
      await ensureAnonymousIdentity();
    } catch {
      return { ok: false, message: 'Kunne ikke endre stemmen. Prøv igjen.' };
    }
    const result = await supabase.rpc('retract_vote', {
      p_session_id: session.id,
      p_round: session.current_round,
    });
    if (generation !== generationRef.current) return { ok: false, message: 'Sesjonen er ikke lenger aktiv.' };
    if (result.error || !isRecord(result.data) || result.data.status !== 'ok') {
      return { ok: false, message: 'Kunne ikke endre stemmen. Prøv igjen.' };
    }
    setOwnVote(null);
    setRoundParticipant({ ...roundParticipant, reestimate_used: true });
    return { ok: true };
  }, [roundParticipant, session]);

  const value: SessionContextValue = {
    session,
    localParticipant,
    ownVote,
    roundParticipant,
    loading,
    error,
    initialized: restoreStatus !== 'initializing',
    restoreStatus,
    connectionState,
    createSession,
    joinSession,
    startSession,
    revealVotes,
    nextRound,
    endSession,
    leaveSession,
    claimRound,
    castVote,
    retractVote,
    retryRestore: restore,
    logout: () => clearAppSession('ready'),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
