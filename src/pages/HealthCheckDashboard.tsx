import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLogo } from '../components/AppLogo';
import { HumanVerification } from '../components/HumanVerification';
import { NavyPageLayout } from '../components/NavyPageLayout';
import {
  HealthCheckFacilitatorDashboard,
  HealthCheckLobby,
  RealHealthResultPanel,
  type HealthCheckProgressRow,
} from '../domains/health-check/components';
import { downloadHealthCheckReport } from '../domains/health-check/report/healthCheckReport';
import type { HealthCheckPrototypeResult, HealthCheckState } from '../domains/health-check/services';
import { useRealtimeParticipants } from '../hooks/useRealtimeParticipants';
import { useSession } from '../hooks/useSession';
import { useSessionPresence } from '../hooks/useSessionPresence';
import { useVisibilityRefetch } from '../hooks/useVisibilityRefetch';
import { resolveRoomRoute } from '../lib/roomRoutes';
import { sessionServices } from '../app/sessionServices';
import {
  clearHealthCheckResultRoom,
  readHealthCheckResultRoom,
  writeHealthCheckResultRoom,
} from '../domains/health-check/storage/healthCheckStorage';

const dateFormatter = new Intl.DateTimeFormat('nb-NO', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
});

export function HealthCheckDashboardPage() {
  const navigate = useNavigate();
  const {
    session, localParticipant, activityType, restoreStatus, error: sessionError,
    createHealthCheck, clearLocalSession,
  } = useSession();
  const [healthState, setHealthState] = useState<HealthCheckState | null>(null);
  const [progressRows, setProgressRows] = useState<readonly HealthCheckProgressRow[]>([]);
  const [result, setResult] = useState<HealthCheckPrototypeResult | null>(null);
  const [recoveryRoomId] = useState(readHealthCheckResultRoom);
  const [recoveryLoading, setRecoveryLoading] = useState(Boolean(recoveryRoomId));
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [finalizeLocked, setFinalizeLocked] = useState(false);
  const terminalRequestStartedRef = useRef(false);
  const mutationInFlightRef = useRef(false);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const stateRequestSequenceRef = useRef(0);
  const progressRequestSequenceRef = useRef(0);
  const sessionId = session?.id ?? null;
  const joinCode = session?.join_code ?? null;
  const participantData = useRealtimeParticipants(healthState?.phase === 'lobby' ? sessionId : null);
  const presence = useSessionPresence(sessionId, localParticipant?.participantId ?? null);

  useEffect(() => () => {
    if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
  }, []);

  const handleCopyCode = useCallback(async () => {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(joinCode);
      setCodeCopied(true);
      setActionError(null);
      if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      setCodeCopied(false);
      setActionError('Kunne ikke kopiere. Marker koden manuelt.');
    }
  }, [joinCode]);

  const loadState = useCallback(async () => {
    if (!sessionId || result) return;
    const requestSequence = ++stateRequestSequenceRef.current;
    const stateResult = await sessionServices.health.getState(sessionId);
    if (requestSequence !== stateRequestSequenceRef.current) return;
    if (!stateResult.ok) {
      setActionError('Kunne ikke hente helsesjekken. Prøv igjen.');
      return;
    }
    setHealthState(stateResult.value);
  }, [result, sessionId]);

  const loadProgress = useCallback(async () => {
    if (!sessionId || healthState?.phase !== 'collecting' || result) return;
    const requestSequence = ++progressRequestSequenceRef.current;
    const progressResult = await sessionServices.health.getProgress(sessionId);
    if (requestSequence !== progressRequestSequenceRef.current) return;
    if (!progressResult.ok) {
      setActionError('Kunne ikke oppdatere deltakerstatus. Prøv igjen.');
      return;
    }
    setProgressRows(progressResult.value.map((row) => ({
      ...row,
      isOnline: presence.presenceReady ? presence.presentParticipantIds.has(row.memberId) : undefined,
    })));
  }, [healthState?.phase, presence.presenceReady, presence.presentParticipantIds, result, sessionId]);

  useEffect(() => {
    if (sessionId && activityType === 'health_check') queueMicrotask(() => void loadState());
  }, [activityType, loadState, sessionId]);

  useEffect(() => {
    if (!recoveryRoomId) return;
    queueMicrotask(async () => {
      try {
        const recovered = await sessionServices.health.finalizePrototype(recoveryRoomId);
        if (recovered.ok) setResult(recovered.value);
      } finally {
        setRecoveryLoading(false);
      }
    });
  }, [recoveryRoomId]);

  useEffect(() => {
    if (!session || !activityType || !localParticipant) return;
    if (activityType !== 'health_check' && localParticipant.role === 'participant') {
      navigate(resolveRoomRoute(activityType, 'participant'), { replace: true });
    } else if (localParticipant.role === 'participant') {
      navigate(resolveRoomRoute('health_check', 'participant'), { replace: true });
    }
  }, [activityType, localParticipant, navigate, session]);

  useEffect(() => {
    if (healthState?.phase !== 'collecting' || result) return;
    queueMicrotask(() => void loadProgress());
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) void loadProgress();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [healthState?.phase, loadProgress, result]);

  useVisibilityRefetch(() => {
    void loadState();
    void loadProgress();
  });

  const runAction = async (action: () => Promise<boolean>) => {
    if (mutationInFlightRef.current) return false;
    mutationInFlightRef.current = true;
    setActionLoading(true);
    setActionError(null);
    try {
      return await action();
    } finally {
      mutationInFlightRef.current = false;
      setActionLoading(false);
    }
  };

  const handleStart = () => runAction(async () => {
    if (!sessionId) return false;
    const startResult = await sessionServices.health.start(sessionId);
    if (!startResult.ok) {
      setActionError('Kunne ikke starte helsesjekken. Kontroller at minst én deltaker er med.');
      return false;
    }
    await loadState();
    return true;
  });

  const handleRemove = (memberId: string) => runAction(async () => {
    if (!sessionId) return false;
    const removeResult = await sessionServices.health.removeRespondent(sessionId, memberId);
    if (!removeResult.ok) {
      setActionError('Kunne ikke fjerne deltakeren.');
      return false;
    }
    await Promise.all([participantData.refetch(), loadProgress()]);
    return true;
  });

  const handleAbort = () => runAction(async () => {
    if (!sessionId) return false;
    const abortResult = await sessionServices.health.abort(sessionId);
    if (!abortResult.ok) {
      setActionError('Kunne ikke avbryte helsesjekken.');
      return false;
    }
    clearLocalSession();
    navigate('/facilitator');
    return true;
  });

  const handleFinalize = () => runAction(async () => {
    if (!sessionId || terminalRequestStartedRef.current) return false;
    terminalRequestStartedRef.current = true;
    setFinalizeLocked(true);
    writeHealthCheckResultRoom(sessionId);
    const finalizeResult = await sessionServices.health.finalizePrototype(sessionId);
    if (!finalizeResult.ok) {
      terminalRequestStartedRef.current = false;
      setFinalizeLocked(false);
      setActionError('Fullføringen feilet. Kontroller tilkoblingen før du prøver igjen.');
      return false;
    }
    setResult(finalizeResult.value);
    clearLocalSession();
    queueMicrotask(() => resultHeadingRef.current?.focus());
    return true;
  });

  if (result) {
    return (
      <NavyPageLayout
        roleLabel="Fasilitator"
        navyContent={<div className="text-center"><h1 ref={resultHeadingRef} tabIndex={-1} className="rounded-sm text-3xl font-bold text-white focus-visible:ring-2 focus-visible:ring-white">Resultatet er klart</h1></div>}
      >
        <main className="mx-auto w-full max-w-3xl space-y-5 pb-10">
          <RealHealthResultPanel result={result} />
          <button
            type="button"
            onClick={() => {
              if (!downloadHealthCheckReport(result)) setActionError('CSV-filen kunne ikke lastes ned.');
            }}
            className="min-h-11 w-full rounded-md px-4 font-bold text-white focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2"
            style={{ background: 'var(--color-red-600)' }}
          >
            Last ned resultat som CSV
          </button>
          <button
            type="button"
            onClick={() => {
              clearHealthCheckResultRoom();
              setResult(null);
              navigate('/facilitator');
            }}
            className="min-h-11 w-full rounded-md px-4 font-bold focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2"
            style={{ color: 'var(--color-navy-700)' }}
          >
            Ferdig
          </button>
          {actionError ? <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>{actionError}</p> : null}
          <p className="text-center text-sm" style={{ color: 'var(--color-neutral-500)' }}>
            Resultatet kan gjenopprettes på denne enheten i opptil 24 timer. Last ned CSV for varig lagring.
          </p>
        </main>
      </NavyPageLayout>
    );
  }

  if (recoveryLoading) {
    return <div className="min-h-screen flex items-center justify-center">Gjenoppretter resultat…</div>;
  }

  if (session && activityType !== 'health_check' && localParticipant?.role === 'facilitator') {
    return <HealthCheckCreationForm onCreate={createHealthCheck} error={sessionError} onBack={() => navigate('/facilitator')} />;
  }

  if (!session && localParticipant && (restoreStatus === 'initializing' || restoreStatus === 'reconnecting')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p>Gjenoppretter helsesjekk…</p>
        <button type="button" className="min-h-11 rounded-md px-4 font-semibold" onClick={() => { clearLocalSession(); navigate('/'); }}>
          Start på nytt
        </button>
      </div>
    );
  }

  if (session && (activityType !== 'health_check' || localParticipant?.role !== 'facilitator')) {
    return <div className="min-h-screen flex items-center justify-center">Åpner aktiv sesjon…</div>;
  }

  if (!session) {
    return <HealthCheckCreationForm onCreate={createHealthCheck} error={sessionError} onBack={() => navigate('/facilitator')} />;
  }

  if (!healthState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p>{actionError ?? 'Henter helsesjekk…'}</p>
        {actionError ? (
          <button type="button" onClick={() => void loadState()} className="min-h-11 rounded-md px-4 font-bold focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2">
            Prøv igjen
          </button>
        ) : null}
      </div>
    );
  }

  if (healthState.phase === 'lobby') {
    const members = participantData.participants
      .filter((participant) => participant.role === 'participant')
      .map((participant) => ({
        memberId: participant.id,
        displayName: participant.name,
        isOnline: presence.presenceReady ? presence.presentParticipantIds.has(participant.id) : undefined,
      }));
    return (
      <HealthCheckLobby
        squadName={healthState.squadName}
        measurementDateLabel={dateFormatter.format(new Date(`${healthState.measurementDate}T00:00:00Z`))}
        joinCode={session.join_code ?? ''}
        codeCopied={codeCopied}
        members={members}
        actionLoading={actionLoading}
        error={actionError ?? participantData.error}
        onCopyCode={() => void handleCopyCode()}
        onStart={() => void handleStart()}
        onRemoveMember={(memberId) => void handleRemove(memberId)}
        onAbort={() => void handleAbort()}
      />
    );
  }

  return (
    <HealthCheckFacilitatorDashboard
      squadName={healthState.squadName}
      progressRows={progressRows}
      actionLoading={actionLoading}
      finalizeLocked={finalizeLocked}
      error={actionError}
      onRemoveInProgress={(memberId) => void handleRemove(memberId)}
      onFinalize={() => void handleFinalize()}
      onAbort={() => void handleAbort()}
    />
  );
}

function HealthCheckCreationForm({
  onCreate,
  error,
  onBack,
}: {
  readonly onCreate: (name: string, squadName: string, measurementDate: string) => Promise<unknown>;
  readonly error: string | null;
  readonly onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [squadName, setSquadName] = useState('');
  const [measurementDate, setMeasurementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const valid = name.trim().length > 0 && squadName.trim().length > 0 && measurementDate.length === 10;

  return (
    <NavyPageLayout
      roleLabel="Fasilitator"
      onBack={onBack}
      navyContent={<div className="text-center"><AppLogo size={56} className="mx-auto mb-4" /><h1 className="text-3xl font-bold text-white">Opprett helsesjekk</h1></div>}
    >
      <HumanVerification>{({ verified, verifying }) => (
      <form
        className="mx-auto w-full max-w-xl space-y-4 pb-10"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid || !verified) return;
          setSubmitting(true);
          await onCreate(name.trim(), squadName.trim(), measurementDate);
          setSubmitting(false);
        }}
      >
        <Field id="health-facilitator-name" label="Ditt navn" value={name} onChange={setName} maxLength={80} />
        <Field id="health-squad-name" label="Squad" value={squadName} onChange={setSquadName} maxLength={80} />
        <label htmlFor="health-measurement-date" className="block text-sm font-bold" style={{ color: 'var(--color-navy-900)' }}>
          Måledato
          <input id="health-measurement-date" type="date" required value={measurementDate} onChange={(event) => setMeasurementDate(event.currentTarget.value)} className="mt-2 block min-h-12 w-full rounded-md border bg-white px-4 focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2" style={{ borderColor: 'var(--color-neutral-300)' }} />
        </label>
        {error ? <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p> : null}
        <button type="submit" disabled={!verified || verifying || !valid || submitting} className="min-h-12 w-full rounded-md px-4 font-bold text-white focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2 disabled:opacity-40" style={{ background: 'var(--color-red-600)' }}>
          {submitting ? 'Oppretter…' : 'Opprett helsesjekk'}
        </button>
      </form>
      )}</HumanVerification>
    </NavyPageLayout>
  );
}

function Field({ id, label, value, onChange, maxLength }: { id: string; label: string; value: string; onChange: (value: string) => void; maxLength: number }) {
  return (
    <label htmlFor={id} className="block text-sm font-bold" style={{ color: 'var(--color-navy-900)' }}>
      {label}
      <input id={id} required value={value} maxLength={maxLength} onChange={(event) => onChange(event.currentTarget.value)} className="mt-2 block min-h-12 w-full rounded-md border bg-white px-4 focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2" style={{ borderColor: 'var(--color-neutral-300)' }} />
    </label>
  );
}
