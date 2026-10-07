import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavyPageLayout } from '../components/NavyPageLayout';
import { HealthCheckResponseFlow } from '../domains/health-check/components';
import { HealthCheckCompletion } from '../domains/health-check/components/HealthCheckCompletion';
import type { HealthCheckResponseMap, HealthCheckState } from '../domains/health-check/services';
import { useSession } from '../hooks/useSession';
import { useSessionPresence } from '../hooks/useSessionPresence';
import { useVisibilityRefetch } from '../hooks/useVisibilityRefetch';
import { resolveRoomRoute } from '../lib/roomRoutes';
import { sessionServices } from '../app/sessionServices';
import { clearHealthCheckDraft } from '../domains/health-check/storage/healthCheckStorage';

export function HealthCheckRespondPage() {
  const navigate = useNavigate();
  const { session, clearLocalSession } = useSession();
  const [completion, setCompletion] = useState<{ sessionId: string; ended: boolean } | null>(null);
  const currentSessionIdRef = useRef(session?.id ?? null);
  useEffect(() => {
    currentSessionIdRef.current = session?.id ?? null;
  }, [session?.id]);

  const refreshCompletion = useCallback(async () => {
    if (!completion || completion.ended) return;
    const result = await sessionServices.health.getState(completion.sessionId);
    if (!result.ok && result.reason === 'forbidden') {
      if (currentSessionIdRef.current === completion.sessionId) clearLocalSession();
      setCompletion((current) => current?.sessionId === completion.sessionId
        ? { ...current, ended: true }
        : current);
    }
  }, [clearLocalSession, completion]);

  useEffect(() => {
    if (!completion || completion.ended) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        void refreshCompletion();
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [completion, refreshCompletion]);

  useVisibilityRefetch(() => void refreshCompletion());

  const handleCompleted = useCallback((sessionId: string) => {
    setCompletion({ sessionId, ended: false });
  }, []);

  if (completion) {
    return <HealthCheckCompletion ended={completion.ended} onExit={() => {
      clearLocalSession();
      navigate('/', { replace: true });
    }} />;
  }

  return (
    <HealthCheckRespondSession
      key={session?.id ?? 'no-session'}
      onCompleted={handleCompleted}
    />
  );
}

function HealthCheckRespondSession({ onCompleted }: {
  readonly onCompleted: (sessionId: string) => void;
}) {
  const navigate = useNavigate();
  const { session, localParticipant, activityType, restoreStatus, leaveSession, clearLocalSession } = useSession();
  const [healthState, setHealthState] = useState<HealthCheckState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const activeRef = useRef(true);
  const submitInFlightRef = useRef(false);
  const stateRequestSessionRef = useRef<string | null>(null);
  const stateRequestSequenceRef = useRef(0);
  const completedRef = useRef(false);
  const sessionId = session?.id ?? null;
  const draftKey = sessionId && localParticipant
    ? `${sessionId}:${localParticipant.participantId}`
    : undefined;
  useSessionPresence(sessionId, localParticipant?.participantId ?? null);

  useEffect(() => () => {
    activeRef.current = false;
    stateRequestSequenceRef.current += 1;
  }, []);

  const loadState = useCallback(async () => {
    if (!sessionId || stateRequestSessionRef.current === sessionId) return;
    stateRequestSessionRef.current = sessionId;
    const requestedSessionId = sessionId;
    const requestSequence = ++stateRequestSequenceRef.current;
    try {
      const result = await sessionServices.health.getState(requestedSessionId);
      if (!activeRef.current || requestSequence !== stateRequestSequenceRef.current) return;
      if (!result.ok) {
        if (result.reason === 'forbidden') {
          if (draftKey) clearHealthCheckDraft(draftKey);
          clearLocalSession();
          setSessionEnded(true);
          setStateError(null);
          return;
        }
        setStateError('Kunne ikke hente helsesjekken. Prøv igjen.');
        return;
      }
      setStateError(null);
      if (result.value.respondentState === 'completed') {
        completedRef.current = true;
        onCompleted(requestedSessionId);
      }
      if (!completedRef.current || result.value.respondentState === 'completed') setHealthState(result.value);
    } finally {
      if (stateRequestSessionRef.current === requestedSessionId) {
        stateRequestSessionRef.current = null;
      }
    }
  }, [clearLocalSession, draftKey, onCompleted, sessionId]);

  useEffect(() => {
    if (sessionId && activityType === 'health_check') queueMicrotask(() => void loadState());
  }, [activityType, loadState, sessionId]);

  useEffect(() => {
    if (draftKey && healthState?.respondentState === 'completed') {
      clearHealthCheckDraft(draftKey);
    }
  }, [draftKey, healthState?.respondentState]);

  useEffect(() => {
    if (!sessionId || sessionEnded || completedRef.current) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) void loadState();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [loadState, sessionEnded, sessionId]);

  useVisibilityRefetch(() => void loadState());

  useEffect(() => {
    if (!activityType || !localParticipant) return;
    if (activityType !== 'health_check') {
      navigate(resolveRoomRoute(activityType, localParticipant.role === 'facilitator' ? 'facilitator' : 'participant'), { replace: true });
    } else if (localParticipant.role === 'facilitator') {
      navigate(resolveRoomRoute('health_check', 'facilitator'), { replace: true });
    }
  }, [activityType, localParticipant, navigate]);

  useEffect(() => {
    if (sessionEnded || completedRef.current) return;
    if ((restoreStatus === 'ready' || restoreStatus === 'invalid') && !session && !localParticipant) {
      navigate(resolveRoomRoute('health_check', 'join'), { replace: true });
    }
  }, [localParticipant, navigate, restoreStatus, session, sessionEnded]);

  const handleLeave = async () => {
    const result = await leaveSession();
    if (!result.ok) {
      setStateError(result.message);
      return;
    }
    navigate('/');
  };

  const handleSubmit = async (responses: HealthCheckResponseMap) => {
    if (!sessionId || submitInFlightRef.current || completedRef.current) return;
    const submittedSessionId = sessionId;
    submitInFlightRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await sessionServices.health.submit(submittedSessionId, responses);
      if (!activeRef.current) return;
      if (!result.ok) {
        setSubmitError('Svarene kunne ikke sendes. Prøv igjen.');
        return;
      }
      // The submit acknowledgement is authoritative, even if subsequent polling
      // fails or the facilitator finalizes the room immediately afterwards.
      completedRef.current = true;
      onCompleted(submittedSessionId);
      if (draftKey) clearHealthCheckDraft(draftKey);
    } catch {
      if (!activeRef.current) return;
      setSubmitError('Svarene kunne ikke sendes. Prøv igjen.');
    } finally {
      if (activeRef.current) {
        setSubmitting(false);
        submitInFlightRef.current = false;
      }
    }
  };

  if (sessionEnded) {
    return (
      <WaitingScreen
        title="Helsesjekken er avsluttet"
        message="Fasilitatoren har avsluttet eller avbrutt denne helsesjekken. Svar kan ikke sendes videre."
        error={null}
        actionLabel="Til forsiden"
        onAction={() => navigate('/', { replace: true })}
      />
    );
  }

  if (!session || !localParticipant || !healthState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p>{stateError ?? 'Henter helsesjekk…'}</p>
        {stateError ? <button type="button" onClick={() => void loadState()} className="min-h-11 rounded-md px-4 font-bold focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2">Prøv igjen</button> : null}
        {(restoreStatus === 'initializing' || restoreStatus === 'reconnecting') ? (
          <button type="button" onClick={() => { clearLocalSession(); navigate('/'); }} className="min-h-11 rounded-md px-4 font-bold focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2">
            Start på nytt
          </button>
        ) : null}
      </div>
    );
  }

  if (healthState.phase === 'lobby') {
    return (
      <WaitingScreen
        title={`Venter på ${healthState.squadName}`}
        message="Fasilitator starter når alle er klare. I små grupper er resultatet ikke garantert anonymt."
        error={stateError}
        actionLabel="Forlat helsesjekken"
        onAction={() => void handleLeave()}
      />
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-neutral-100)' }}>
        <HealthCheckResponseFlow
          key={draftKey}
          draftKey={draftKey}
          draftExpiresAt={healthState.expiresAt}
          submitting={submitting}
          submitError={submitError}
          onSubmit={handleSubmit}
        />
    </div>
  );
}

function WaitingScreen({ title, message, error, actionLabel, onAction }: {
  readonly title: string;
  readonly message: string;
  readonly error: string | null;
  readonly actionLabel: string;
  readonly onAction: () => void;
}) {
  return (
    <NavyPageLayout
      roleLabel="Deltager"
      navyContent={<div className="text-center"><h1 className="break-words text-3xl font-bold text-white">{title}</h1><p className="mt-2 text-sm text-white">{message}</p></div>}
    >
      <main className="mx-auto w-full max-w-xl space-y-4 pb-10 text-center">
        <p role="status" className="text-sm" style={{ color: 'var(--color-neutral-700)' }}>Denne siden oppdateres automatisk.</p>
        {error ? <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
        <button type="button" onClick={onAction} className="min-h-11 rounded-md px-4 font-bold focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2" style={{ color: 'var(--color-navy-700)' }}>
          {actionLabel}
        </button>
      </main>
    </NavyPageLayout>
  );
}
