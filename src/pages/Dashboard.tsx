import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLogo } from '../components/AppLogo';
import { NavyPageLayout } from '../components/NavyPageLayout';
import { HumanVerification } from '../components/HumanVerification';
import { PreStartPanel } from '../components/dashboard/PreStartPanel';
import { VotesPanel } from '../components/dashboard/VotesPanel';
import { useRealtimeParticipants } from '../hooks/useRealtimeParticipants';
import { useRealtimeRoundParticipants } from '../hooks/useRealtimeRoundParticipants';
import { useRealtimeVotes } from '../hooks/useRealtimeVotes';
import { useRoundVoteStatuses } from '../hooks/useRoundVoteStatuses';
import { useSessionPresence } from '../hooks/useSessionPresence';
import { useSession } from '../hooks/useSession';
import { useWakeLock } from '../hooks/useWakeLock';

/** Fasilitator-dashboard (revisjon 3) – ett sammenhengende view, ingen tabs. */
export function DashboardPage() {
  const navigate = useNavigate();
  const { session, activityType, localParticipant, loading, error, restoreStatus, connectionState, createSession, startSession, nextRound, endSession, revealVotes, deactivateParticipant, clearLocalSession, logout } =
    useSession();

  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const estimationSession = activityType === 'estimation' ? session : null;

  // Ref for å rydde setTimeout og unngå state-oppdatering etter unmount
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const participantData = useRealtimeParticipants(estimationSession?.id ?? null, estimationSession?.started ?? false);
  const roundData = useRealtimeRoundParticipants(estimationSession?.id ?? null, estimationSession?.current_round ?? 1);
  const { participants } = participantData;
  const { roundParticipants } = roundData;
  const { presentParticipantIds, connectionState: presenceConnectionState, presenceReady } = useSessionPresence(
    estimationSession?.id ?? null,
    localParticipant?.participantId ?? null,
  );
  const voteData = useRealtimeVotes(
    estimationSession?.votes_revealed ? estimationSession.id : null,
    estimationSession?.current_round ?? 1,
    estimationSession?.votes_revealed ?? false,
  );
  const { votes } = voteData;
  const statusData = useRoundVoteStatuses(
    estimationSession?.id ?? null,
    estimationSession?.current_round ?? 1,
    Boolean(estimationSession?.started && !estimationSession.votes_revealed),
  );

  const isFacilitator = localParticipant?.role === 'facilitator';

  // Statiske dots for sesjonskode-kortet – navy-farger
  const joinCodeDots = useMemo(() => [
    { color: 'var(--color-navy-900)' },
    { color: 'var(--color-navy-700)' },
    { color: 'var(--color-navy-500)' },
    { color: 'var(--color-navy-200)' },
  ], []);

  useEffect(() => {
    if (estimationSession?.status === 'completed' && isFacilitator) {
      logout();
      navigate('/');
    }
  }, [estimationSession?.status, isFacilitator, logout, navigate]);

  // Cleanup copyTimeout ved unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) {
      setNameError('Skriv inn et navn for å fortsette.');
      return;
    }
    setNameError(null);
    setCreating(true);
    await createSession(name);
    setCreating(false);
  }, [nameInput, createSession]);

  const handleStartSession = useCallback(async () => {
    setActionError(null);
    setActionLoading(true);
    const result = await startSession();
    setActionLoading(false);
    if (!result.ok) setActionError(result.message);
  }, [startSession]);

  const handleNextRound = useCallback(async () => {
    setActionError(null);
    setActionLoading(true);
    const result = await nextRound();
    setActionLoading(false);
    if (!result.ok) setActionError(result.message);
  }, [nextRound]);

  const handleReveal = useCallback(async () => {
    setActionError(null);
    setActionLoading(true);
    const result = await revealVotes();
    setActionLoading(false);
    if (!result.ok) setActionError(result.message);
  }, [revealVotes]);

  const handleEndSession = useCallback(async () => {
    const confirmed = window.confirm('Er du sikker på at du vil avslutte sesjonen?');
    if (!confirmed) return;
    setActionError(null);
    setActionLoading(true);
    const result = await endSession();
    setActionLoading(false);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    logout();
    navigate('/');
  }, [endSession, logout, navigate]);

  const handleCopyCode = useCallback(async () => {
    if (!session?.join_code) return;
    try {
      await navigator.clipboard.writeText(session.join_code);
      setCopyError(null);
      setCodeCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      setCodeCopied(false);
      setCopyError('Kunne ikke kopiere. Marker koden manuelt.');
    }
  }, [session]);

  // ── Opprett sesjon ─────────────────────────────────────────
  if (!session && localParticipant && (restoreStatus === 'initializing' || restoreStatus === 'reconnecting')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p>{restoreStatus === 'initializing' ? 'Gjenoppretter sesjon…' : 'Kobler til sesjonen på nytt…'}</p>
        <button type="button" className="min-h-11 rounded-md px-4 font-semibold" onClick={() => { clearLocalSession(); navigate('/'); }}>
          Start på nytt
        </button>
      </div>
    );
  }

  if (!isFacilitator || !session || activityType !== 'estimation') {
    return (
      <NavyPageLayout
        roleLabel="Fasilitator"
        onBack={() => navigate('/')}
        navyContent={
          <div className="text-center">
            <AppLogo size={56} className="mx-auto mb-4" />
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0 }}>
              Opprett sesjon
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
              Gi sesjonen et navn så deltakerne vet hvor de er
            </p>
          </div>
        }
      >
        <HumanVerification>{({ verified, verifying }) => (
        <>
        {restoreStatus === 'invalid' && (
          <p role="alert" className="mb-4 text-sm" style={{ color: 'var(--color-danger)' }}>
            Forrige sesjon er utløpt eller ikke lenger tilgjengelig.
          </p>
        )}
        <form
          onSubmit={(event) => {
            if (!verified) {
              event.preventDefault();
              return;
            }
            void handleCreate(event);
          }}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="facilitator-name"
              className="block mb-2"
              style={{ fontSize: 14, fontWeight: 500, color: '#0B1D3A' }}
            >
              Ditt navn
            </label>
            <input
              id="facilitator-name"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Fasilitators navn"
              maxLength={60}
              autoFocus
              className="w-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2"
              style={{
                height: 52,
                borderRadius: 12,
                border: '1.5px solid #E2E0DC',
                background: '#fff',
                padding: '0 16px',
                fontSize: 16,
                color: '#0B1D3A',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0B1D3A'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E0DC'; }}
            />
            {nameError && (
              <p className="mt-1 text-sm" style={{ color: 'var(--color-danger)' }}>
                {nameError}
              </p>
            )}
            {error && (
              <p className="mt-1 text-sm" style={{ color: 'var(--color-danger)' }}>
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!verified || verifying || !nameInput.trim() || creating || loading}
            className="w-full font-semibold text-white transition-opacity focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2"
            style={{
              height: 52,
              borderRadius: 12,
              background: '#0B1D3A',
              fontSize: 16,
              fontWeight: 600,
              opacity: !verified || verifying || !nameInput.trim() || creating || loading ? 0.4 : 1,
              cursor: verified && !verifying && nameInput.trim() && !creating && !loading ? 'pointer' : 'not-allowed',
            }}
          >
            {creating || loading ? 'Oppretter…' : 'Opprett sesjon'}
          </button>
        </form>

        <p style={{ fontSize: 13, color: '#6B6865', textAlign: 'center', marginTop: 16 }}>
          Deltakere kobler seg til med en 4-sifret kode
        </p>
        </>
        )}</HumanVerification>
      </NavyPageLayout>
    );
  }

  // Tell deltakere som har stemt (ikke fasilitator)
  const roundParticipantIds = new Set(roundParticipants.map((row) => row.participant_id));
  const voterParticipants = participants.filter((p) => p.role === 'participant' && p.left_at === null && roundParticipantIds.has(p.id));
  const rosterIds = new Set(voterParticipants.map((participant) => participant.id));
  const rosterVotes = votes.filter((vote) => rosterIds.has(vote.participant_id));
  const votedParticipantIds = new Set(
    session.votes_revealed
      ? rosterVotes.map((vote) => vote.participant_id)
      : statusData.statuses.filter((status) => status.has_voted && rosterIds.has(status.participant_id)).map((status) => status.participant_id),
  );
  const reestimatingParticipantIds = new Set(
    roundParticipants.filter((row) => row.reestimate_used).map((row) => row.participant_id),
  );
  const votedCount = votedParticipantIds.size;
  const totalCount = voterParticipants.length;
  const progressPct = totalCount > 0 ? (votedCount / totalCount) * 100 : 0;

  const sessionStarted = session.started;
  const datasetLoading = participantData.loading || roundData.loading
    || (session.votes_revealed ? voteData.loading : statusData.loading);
  const datasetError = participantData.error || roundData.error
    || (session.votes_revealed ? voteData.error : statusData.error);
  const dataActionsDisabled = datasetLoading || Boolean(datasetError);
  const realtimeDisconnected = connectionState === 'disconnected'
    || participantData.connectionState === 'disconnected'
    || roundData.connectionState === 'disconnected'
    || (session.votes_revealed && voteData.connectionState === 'disconnected');

  // ── Dashboard ──────────────────────────────────────────────
  // Wrapper-komponent som aktiverer Wake Lock kun i det aktive dashboard-viewet
  return <ActiveDashboardView
    session={session}
    voterParticipants={voterParticipants}
    participants={participants}
    votes={rosterVotes}
    votedParticipantIds={votedParticipantIds}
    presentParticipantIds={presentParticipantIds}
    presenceReady={presenceReady}
    presenceConnectionState={presenceConnectionState}
    reestimatingParticipantIds={reestimatingParticipantIds}
    votedCount={votedCount}
    totalCount={totalCount}
    progressPct={progressPct}
    sessionStarted={sessionStarted}
    actionLoading={actionLoading || dataActionsDisabled || realtimeDisconnected}
    endSessionLoading={actionLoading}
    datasetLoading={datasetLoading}
    error={actionError ?? copyError ?? datasetError ?? error}
    codeCopied={codeCopied}
    joinCodeDots={joinCodeDots}
    handleEndSession={handleEndSession}
    handleReveal={handleReveal}
    handleNextRound={handleNextRound}
    handleStartSession={handleStartSession}
    handleCopyCode={handleCopyCode}
    handleRemoveParticipant={(participantId) => {
      if (window.confirm('Fjerne deltakeren fra denne sesjonen? Historiske stemmer beholdes.')) {
        void deactivateParticipant(participantId).then((result) => {
          if (!result.ok) setActionError(result.message);
        });
      }
    }}
  />;
}

/** Props til ActiveDashboardView */
interface ActiveDashboardViewProps {
  session: NonNullable<ReturnType<typeof useSession>['session']>;
  voterParticipants: ReturnType<typeof useRealtimeParticipants>['participants'];
  participants: ReturnType<typeof useRealtimeParticipants>['participants'];
  votes: ReturnType<typeof useRealtimeVotes>['votes'];
  votedParticipantIds: ReadonlySet<string>;
  presentParticipantIds: ReadonlySet<string>;
  presenceReady: boolean;
  presenceConnectionState: ReturnType<typeof useSessionPresence>['connectionState'];
  reestimatingParticipantIds: ReadonlySet<string>;
  votedCount: number;
  totalCount: number;
  progressPct: number;
  sessionStarted: boolean;
  actionLoading: boolean;
  endSessionLoading: boolean;
  datasetLoading: boolean;
  error: string | null;
  codeCopied: boolean;
  joinCodeDots: { color: string }[];
  handleEndSession: () => void;
  handleReveal: () => void;
  handleNextRound: () => void;
  handleStartSession: () => void;
  handleCopyCode: () => void;
  handleRemoveParticipant: (participantId: string) => void;
}

/**
 * Det aktive dashboard-viewet.
 * Hookes opp Wake Lock her så den kun er aktiv når fasilitator har en pågående sesjon,
 * ikke i opprett-sesjon-skjermen.
 */
function ActiveDashboardView({
  session,
  voterParticipants,
  participants,
  votes,
  votedParticipantIds,
  presentParticipantIds,
  presenceReady,
  presenceConnectionState,
  reestimatingParticipantIds,
  votedCount,
  totalCount,
  progressPct,
  sessionStarted,
  actionLoading,
  endSessionLoading,
  datasetLoading,
  error,
  codeCopied,
  joinCodeDots,
  handleEndSession,
  handleReveal,
  handleNextRound,
  handleStartSession,
  handleCopyCode,
  handleRemoveParticipant,
}: ActiveDashboardViewProps) {
  useWakeLock(); // Holder skjermen våken mens fasilitator er i aktiv sesjon

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--color-neutral-100)' }}
    >
      {/* Mørk navy-header */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{ background: 'var(--color-navy-900)' }}
      >
        <span
          className="text-base font-semibold text-white flex-1"
        >
          Fasilitator
        </span>

        {/* Runde-badge */}
        <span
          className="text-xs px-2.5 py-1 rounded-full font-medium"
          style={{
            background: 'rgba(255,255,255,.10)',
            color: 'var(--color-navy-200)',
          }}
        >
          Runde {session.current_round}
        </span>

        {/* Avslutt-knapp */}
        <button
          type="button"
          onClick={handleEndSession}
          disabled={endSessionLoading}
          className="min-h-11 px-3 text-xs font-semibold text-white transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-900)]"
          style={{
            background: 'var(--color-red-600)',
            borderRadius: 'var(--radius-md)',
            opacity: endSessionLoading ? 0.6 : 1,
          }}
        >
          Avslutt
        </button>
      </div>

      {/* Progress bar – kun synlig etter sesjon er startet */}
      {sessionStarted && (
        <div
          className="h-1.5 w-full"
          style={{ background: 'var(--color-navy-700)' }}
        >
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${progressPct}%`,
              background: 'var(--color-red-600)',
            }}
          />
        </div>
      )}

       <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
        {error && <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        {datasetLoading && <p role="status" className="text-sm" style={{ color: 'var(--color-neutral-500)' }}>Henter autoritative sesjonsdata…</p>}
        {presenceConnectionState === 'connecting' || presenceConnectionState === 'disconnected' ? (
          <p role="status" className="text-xs" style={{ color: 'var(--color-neutral-500)' }}>Kobler til status…</p>
        ) : null}
        {/* Sesjonskode-kort */}
        <div
          className="px-5 py-4 space-y-1"
          style={{
            background: 'var(--color-navy-900)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <p
              className="text-xs"
              style={{ color: '#7A93B8' }}
            >
              Del med deltakere
            </p>
            {/* Fargede dots */}
            <div className="flex gap-1.5">
              {joinCodeDots.map((dot, i) => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: dot.color }}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyCode}
            className="w-full text-center transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-navy-900)]"
          >
            <span
              className="text-5xl font-extrabold tracking-[0.25em] text-white block"
            >
              {session.join_code}
            </span>
            <span
              className="text-xs mt-1 block"
              style={{ color: codeCopied ? '#A0BADE' : '#7A93B8' }}
              aria-live="polite"
            >
              {codeCopied ? '✓ Kopiert!' : 'Trykk for å kopiere'}
            </span>
          </button>
        </div>

        {/* Kombinert deltaker + stemme-panel */}
        <div
          className="bg-white overflow-hidden"
          style={{
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="p-4">
            {sessionStarted ? (
              /* Etter oppstart: vis deltakere med stemmestatus */
              <VotesPanel
                participants={voterParticipants}
                votes={votes}
                revealed={session.votes_revealed}
                votedCount={votedCount}
                totalCount={totalCount}
                actionLoading={actionLoading}
                presentParticipantIds={presentParticipantIds}
                presenceReady={presenceReady}
                reestimatingParticipantIds={reestimatingParticipantIds}
                votedParticipantIds={votedParticipantIds}
                onRemoveParticipant={handleRemoveParticipant}
                onReveal={handleReveal}
                onNextRound={handleNextRound}
              />
            ) : (
              /* Før oppstart: vis deltakerliste + "Start sesjon"-knapp */
              <PreStartPanel
                participants={participants}
                presentParticipantIds={presentParticipantIds}
                presenceReady={presenceReady}
                actionLoading={actionLoading}
                onStart={handleStartSession}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
