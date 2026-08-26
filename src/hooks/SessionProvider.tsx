import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { sessionServices } from '../app/sessionServices';
import type {
  LocalParticipant,
  RoomActivityType,
  RoundParticipant,
  Session,
  SessionPointer,
  Vote,
  VoteSubmission,
} from '../lib/types';
import type { RoomMembershipSnapshot } from '../rooms/services/roomMembershipService';
import { SessionContext, type ConnectionState, type JoinResult, type MutationResult, type RestoreStatus, type SessionContextValue } from './sessionContext';

const GENERIC_RESTORE_ERROR = 'Kunne ikke koble til sesjonen. Vi prøver igjen.';
const { roomMembership, estimation, storage, realtime } = sessionServices;

export function SessionProvider({ children }: PropsWithChildren) {
  const [pointer, setPointer] = useState<SessionPointer | null>(storage.readSessionPointer);
  const [session, setSession] = useState<Session | null>(null);
  const [activityType, setActivityType] = useState<RoomActivityType | null>(() => storage.readSessionPointer()?.activityType ?? null);
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(() => {
    const initial = storage.readSessionPointer();
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
    storage.clearSessionPointer();
    setPointer(null);
    setSession(null);
    setActivityType(null);
    setLocalParticipant(null);
    setOwnVote(null);
    setRoundParticipant(null);
    setRestoreStatus(status);
    setConnectionState('idle');
    setError(null);
  }, []);

  const restore = useCallback(async () => {
    const activePointer = storage.readSessionPointer();
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
        const result = await roomMembership.restore(activePointer.sessionId);
        if (generation !== generationRef.current) return;
        if (!result.ok && (result.reason === 'membership_missing' || result.reason === 'session_completed')) {
          clearAppSession('invalid');
          return;
        }
        if (!result.ok) throw new Error('restore_failed');
        roomMembership.persist(result.snapshot);
        setPointer(result.snapshot.pointer);
        setSession(result.snapshot.session);
        setActivityType(result.snapshot.activityType);
        setLocalParticipant(result.snapshot.localParticipant);
        setOwnVote(result.snapshot.ownVote);
        setRoundParticipant(result.snapshot.roundParticipant);
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
      const latestPointer = storage.readSessionPointer();
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
      let retired = false;
      const currentChannel = realtime
        .channel(`session:${sessionId}:session-watch:${generation}`, { config: { private: true } })
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}`,
        }, () => {
          if (active && !retired && channel === currentChannel && generation === generationRef.current) void restore();
        })
        .subscribe((status) => {
          if (!active || retired || channel !== currentChannel || generation !== generationRef.current) return;
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
              if (!active || retired || channel !== currentChannel || generation !== generationRef.current) return;
              retired = true;
              void realtime.removeChannel(currentChannel);
              connect();
            }, 2000);
          }
        });
      channel = currentChannel;
    };
    connect();
    return () => {
      active = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (channel) void realtime.removeChannel(channel);
    };
  }, [pointer?.sessionId, restore]);

  const applyMembership = useCallback((snapshot: RoomMembershipSnapshot) => {
    setPointer(snapshot.pointer);
    setSession(snapshot.session);
    setActivityType(snapshot.activityType);
    setLocalParticipant(snapshot.localParticipant);
    setOwnVote(null);
    setRoundParticipant(snapshot.roundParticipant);
    setRestoreStatus('ready');
    setError(null);
  }, []);

  const createSession = useCallback(async (name: string): Promise<Session | null> => {
    const generation = ++generationRef.current;
    setPointer(null);
    setLoading(true);
    setError(null);
    try {
      const result = await roomMembership.create(name, storage.getOrCreateCreateRequestId());
      if (generation !== generationRef.current) return null;
      if (!result.ok) throw new Error('create_failed');
      roomMembership.persist(result.snapshot, { clearCreateRequestId: true });
      applyMembership(result.snapshot);
      return result.snapshot.session;
    } catch {
      if (generation === generationRef.current) setError('Kunne ikke opprette sesjon. Prøv igjen.');
      return null;
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [applyMembership]);

  const createHealthCheck = useCallback(async (
    name: string,
    squadName: string,
    measurementDate: string,
  ): Promise<Session | null> => {
    const generation = ++generationRef.current;
    setPointer(null);
    setLoading(true);
    setError(null);
    try {
      const result = await roomMembership.createHealth({
        name,
        squadName,
        measurementDate,
        requestId: storage.getOrCreateCreateRequestId(),
        deliveryId: crypto.randomUUID(),
      });
      if (generation !== generationRef.current) return null;
      if (!result.ok) {
        if (result.reason === 'active_session_exists') {
          throw new Error('active_health_session_exists');
        }
        throw new Error('create_health_failed');
      }
      roomMembership.persist(result.snapshot, { clearCreateRequestId: true });
      applyMembership(result.snapshot);
      return result.snapshot.session;
    } catch (error) {
      if (generation === generationRef.current) {
        setError(error instanceof Error && error.message === 'active_health_session_exists'
          ? 'Du har allerede en aktiv helsesjekk. Åpne den aktive sesjonen eller avslutt den først.'
          : 'Kunne ikke opprette helsesjekken. Prøv igjen.');
      }
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
      const result = await roomMembership.join(code, name);
      if (generation !== generationRef.current) return { ok: false, reason: 'transient' };
      if (!result.ok && (result.reason === 'session_not_found' || result.reason === 'role_conflict')) {
        return { ok: false, reason: result.reason };
      }
      if (!result.ok) throw new Error('join_failed');
      roomMembership.persist(result.snapshot, { rememberName: true });
      applyMembership(result.snapshot);
      return { ok: true, activityType: result.snapshot.activityType };
    } catch {
      if (generation === generationRef.current) setError('Kunne ikke koble til sesjonen. Prøv igjen.');
      return { ok: false, reason: 'transient' };
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [applyMembership]);

  const sessionMutation = useCallback(async (
    operation: 'start' | 'reveal' | 'next' | 'end',
    message: string,
  ): Promise<MutationResult> => {
    if (!session) return { ok: false, message: 'Ingen aktiv sesjon.' };
    setError(null);
    const generation = generationRef.current;
    try {
      const result = await estimation[operation](session);
      if (generation !== generationRef.current || !result.ok) throw new Error('mutation_failed');
      setSession(result.session);
      return { ok: true };
    } catch {
      if (generation === generationRef.current) setError(message);
      return { ok: false, message };
    }
  }, [session]);

  const startSession = useCallback(() => sessionMutation('start', 'Kunne ikke starte sesjonen. Prøv igjen.'), [sessionMutation]);
  const revealVotes = useCallback(() => sessionMutation('reveal', 'Kunne ikke avsløre stemmer. Prøv igjen.'), [sessionMutation]);
  const nextRound = useCallback(() => sessionMutation('next', 'Kunne ikke starte ny runde. Prøv igjen.'), [sessionMutation]);
  const endSession = useCallback(() => sessionMutation('end', 'Kunne ikke avslutte sesjonen. Prøv igjen.'), [sessionMutation]);

  const leaveSession = useCallback(async (): Promise<MutationResult> => {
    if (!session) return { ok: false, message: 'Ingen aktiv sesjon.' };
    const generation = generationRef.current;
    try {
      const result = await roomMembership.leave(session.id);
      if (generation !== generationRef.current || !result.ok) throw new Error('leave_failed');
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
    const result = await estimation.claim(session, localParticipant);
    if (generation !== generationRef.current) return { ok: false, message: 'Sesjonen er ikke lenger aktiv.' };
    if (!result.ok) {
      return { ok: false, message: 'Kunne ikke klargjøre runden. Prøv igjen.' };
    }
    setRoundParticipant(result.roundParticipant);
    return { ok: true };
  }, [localParticipant, session]);

  const castVote = useCallback(async (vote: VoteSubmission): Promise<MutationResult> => {
    if (!session || !localParticipant || !roundParticipant) return { ok: false, message: 'Ingen aktiv sesjon.' };
    const generation = generationRef.current;
    const result = await estimation.cast(session, localParticipant, vote);
    if (generation !== generationRef.current) return { ok: false, message: 'Sesjonen er ikke lenger aktiv.' };
    if (!result.ok) {
      if (result.reason !== 'identity') void restore();
      return { ok: false, message: 'Kunne ikke registrere stemme. Prøv igjen.' };
    }
    setOwnVote(result.vote);
    return { ok: true };
  }, [localParticipant, restore, roundParticipant, session]);

  const retractVote = useCallback(async (): Promise<MutationResult> => {
    if (!session || !roundParticipant) return { ok: false, message: 'Ingen aktiv stemme.' };
    const generation = generationRef.current;
    const result = await estimation.retract(session);
    if (generation !== generationRef.current) return { ok: false, message: 'Sesjonen er ikke lenger aktiv.' };
    if (!result.ok) {
      return { ok: false, message: 'Kunne ikke endre stemmen. Prøv igjen.' };
    }
    setOwnVote(null);
    setRoundParticipant({ ...roundParticipant, reestimate_used: true });
    return { ok: true };
  }, [roundParticipant, session]);

  const value: SessionContextValue = {
    session,
    activityType,
    localParticipant,
    ownVote,
    roundParticipant,
    loading,
    error,
    initialized: restoreStatus !== 'initializing',
    restoreStatus,
    connectionState,
    createSession,
    createHealthCheck,
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
    clearLocalSession: () => clearAppSession('ready'),
    logout: () => clearAppSession('ready'),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
