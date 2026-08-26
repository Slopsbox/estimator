import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavyPageLayout } from '../components/NavyPageLayout';
import { HealthCheckResponseFlow } from '../domains/health-check/components';
import type { HealthCheckResponseMap, HealthCheckState } from '../domains/health-check/services';
import { useSession } from '../hooks/useSession';
import { useSessionPresence } from '../hooks/useSessionPresence';
import { useVisibilityRefetch } from '../hooks/useVisibilityRefetch';
import { resolveRoomRoute } from '../lib/roomRoutes';
import { sessionServices } from '../app/sessionServices';

export function HealthCheckRespondPage() {
  const navigate = useNavigate();
  const { session, localParticipant, activityType, restoreStatus, leaveSession, clearLocalSession } = useSession();
  const [healthState, setHealthState] = useState<HealthCheckState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);
  const sessionId = session?.id ?? null;
  useSessionPresence(sessionId, localParticipant?.participantId ?? null);

  const loadState = useCallback(async () => {
    if (!sessionId) return;
    const result = await sessionServices.health.getState(sessionId);
    if (!result.ok) {
      setStateError('Kunne ikke hente helsesjekken. Prøv igjen.');
      return;
    }
    setStateError(null);
    setHealthState(result.value);
  }, [sessionId]);

  useEffect(() => {
    if (sessionId && activityType === 'health_check') queueMicrotask(() => void loadState());
  }, [activityType, loadState, sessionId]);

  useEffect(() => {
    if (healthState?.phase !== 'lobby') return;
    const timer = window.setInterval(() => void loadState(), 2000);
    return () => window.clearInterval(timer);
  }, [healthState?.phase, loadState]);

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
    if ((restoreStatus === 'ready' || restoreStatus === 'invalid') && !session && !localParticipant) {
      navigate(resolveRoomRoute('estimation', 'join'), { replace: true });
    }
  }, [localParticipant, navigate, restoreStatus, session]);

  const handleLeave = async () => {
    const result = await leaveSession();
    if (!result.ok) {
      setStateError(result.message);
      return;
    }
    navigate('/');
  };

  const handleSubmit = async (responses: HealthCheckResponseMap) => {
    if (!sessionId || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const result = await sessionServices.health.submit(sessionId, responses);
    setSubmitting(false);
    submitInFlightRef.current = false;
    if (!result.ok) {
      setSubmitError('Svarene kunne ikke sendes. Prøv igjen.');
      return;
    }
    await loadState();
  };

  if (!session || !localParticipant || !healthState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p>{stateError ?? 'Henter helsesjekk…'}</p>
        {stateError ? <button type="button" onClick={() => void loadState()} className="min-h-11 rounded-md px-4 font-bold focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2">Prøv igjen</button> : null}
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

  if (healthState.respondentState === 'completed') {
    return (
      <WaitingScreen
        title="Svarene er registrert"
        message="Vent mens resten av squaden svarer. Du kan lukke fanen."
        error={stateError}
        actionLabel="Til forsiden"
        onAction={() => {
          clearLocalSession();
          navigate('/');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-neutral-100)' }}>
      <HealthCheckResponseFlow
        participantName={localParticipant.name}
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
