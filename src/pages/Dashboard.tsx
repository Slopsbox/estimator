import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLogo } from '../components/AppLogo';
import { NavyPageLayout } from '../components/NavyPageLayout';
import { PreStartPanel } from '../components/dashboard/PreStartPanel';
import { VotesPanel } from '../components/dashboard/VotesPanel';
import { useRealtimeParticipants } from '../hooks/useRealtimeParticipants';
import { useRealtimeVotes } from '../hooks/useRealtimeVotes';
import { useSession } from '../hooks/useSession';
import { useWakeLock } from '../hooks/useWakeLock';

/** Fasilitator-dashboard (revisjon 3) – ett sammenhengende view, ingen tabs. */
export function DashboardPage() {
  const navigate = useNavigate();
  const { session, localParticipant, loading, error, createSession, startSession, nextRound, endSession, revealVotes, logout } =
    useSession();

  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Ref for å rydde setTimeout og unngå state-oppdatering etter unmount
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { participants } = useRealtimeParticipants(session?.id ?? null);
  const { votes, deletedParticipantIds } = useRealtimeVotes(
    session?.id ?? null,
    session?.current_round ?? 1,
    session?.votes_revealed ?? false,
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
    if (session?.status === 'completed' && isFacilitator) {
      logout();
      navigate('/');
    }
  }, [session?.status, isFacilitator, logout, navigate]);

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
    setActionLoading(true);
    await startSession();
    setActionLoading(false);
  }, [startSession]);

  const handleNextRound = useCallback(async () => {
    setActionLoading(true);
    await nextRound();
    setActionLoading(false);
  }, [nextRound]);

  const handleReveal = useCallback(async () => {
    setActionLoading(true);
    await revealVotes(votes);
    setActionLoading(false);
  }, [revealVotes, votes]);

  const handleEndSession = useCallback(async () => {
    const confirmed = window.confirm('Er du sikker på at du vil avslutte sesjonen?');
    if (!confirmed) return;
    setActionLoading(true);
    await endSession();
    setActionLoading(false);
    logout();
    navigate('/');
  }, [endSession, logout, navigate]);

  const handleCopyCode = useCallback(async () => {
    if (!session?.join_code) return;
    try {
      await navigator.clipboard.writeText(session.join_code);
      setCodeCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Clipboard API ikke tilgjengelig – vis "Kopiert!"-indikator som fallback
      // (koden er allerede synlig på skjermen)
      setCodeCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCodeCopied(false), 2000);
    }
  }, [session]);

  // ── Opprett sesjon ─────────────────────────────────────────
  if (!isFacilitator || !session) {
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
        <form onSubmit={handleCreate} className="space-y-4">
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
              className="w-full focus:outline-none transition-colors"
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
            disabled={!nameInput.trim() || creating || loading}
            className="w-full font-semibold text-white focus:outline-none transition-opacity"
            style={{
              height: 52,
              borderRadius: 12,
              background: '#0B1D3A',
              fontSize: 16,
              fontWeight: 600,
              opacity: !nameInput.trim() || creating || loading ? 0.4 : 1,
              cursor: !nameInput.trim() || creating || loading ? 'not-allowed' : 'pointer',
            }}
          >
            {creating || loading ? 'Oppretter…' : 'Opprett sesjon'}
          </button>
        </form>

        <p style={{ fontSize: 13, color: '#6B6865', textAlign: 'center', marginTop: 16 }}>
          Deltakere kobler seg til med en 4-sifret kode
        </p>
      </NavyPageLayout>
    );
  }

  // Tell deltakere som har stemt (ikke fasilitator)
  const voterParticipants = participants.filter((p) => p.role === 'participant');
  const votedCount = votes.length;
  const totalCount = voterParticipants.length;
  const progressPct = totalCount > 0 ? (votedCount / totalCount) * 100 : 0;

  const sessionStarted = session.started;

  // ── Dashboard ──────────────────────────────────────────────
  // Wrapper-komponent som aktiverer Wake Lock kun i det aktive dashboard-viewet
  return <ActiveDashboardView
    session={session}
    voterParticipants={voterParticipants}
    participants={participants}
    votes={votes}
    deletedParticipantIds={deletedParticipantIds}
    votedCount={votedCount}
    totalCount={totalCount}
    progressPct={progressPct}
    sessionStarted={sessionStarted}
    actionLoading={actionLoading}
    codeCopied={codeCopied}
    joinCodeDots={joinCodeDots}
    handleEndSession={handleEndSession}
    handleReveal={handleReveal}
    handleNextRound={handleNextRound}
    handleStartSession={handleStartSession}
    handleCopyCode={handleCopyCode}
    logout={logout}
    navigate={navigate}
  />;
}

/** Props til ActiveDashboardView */
interface ActiveDashboardViewProps {
  session: NonNullable<ReturnType<typeof useSession>['session']>;
  voterParticipants: ReturnType<typeof useRealtimeParticipants>['participants'];
  participants: ReturnType<typeof useRealtimeParticipants>['participants'];
  votes: ReturnType<typeof useRealtimeVotes>['votes'];
  deletedParticipantIds: ReturnType<typeof useRealtimeVotes>['deletedParticipantIds'];
  votedCount: number;
  totalCount: number;
  progressPct: number;
  sessionStarted: boolean;
  actionLoading: boolean;
  codeCopied: boolean;
  joinCodeDots: { color: string }[];
  handleEndSession: () => void;
  handleReveal: () => void;
  handleNextRound: () => void;
  handleStartSession: () => void;
  handleCopyCode: () => void;
  logout: () => void;
  navigate: (path: string) => void;
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
  deletedParticipantIds,
  votedCount,
  totalCount,
  progressPct,
  sessionStarted,
  actionLoading,
  codeCopied,
  joinCodeDots,
  handleEndSession,
  handleReveal,
  handleNextRound,
  handleStartSession,
  handleCopyCode,
  logout,
  navigate,
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
        <button
          type="button"
          onClick={() => { logout(); navigate('/'); }}
          className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
          style={{ background: 'rgba(255,255,255,.10)', color: 'white' }}
          aria-label="Tilbake"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

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
          disabled={actionLoading}
          className="text-xs px-3 py-1.5 font-semibold text-white transition-all focus:outline-none"
          style={{
            background: 'var(--color-red-600)',
            borderRadius: 'var(--radius-md)',
            opacity: actionLoading ? 0.6 : 1,
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
            className="w-full text-center transition-all focus:outline-none"
          >
            <span
              className="text-5xl font-extrabold tracking-[0.25em] text-white block"
            >
              {session.join_code}
            </span>
            <span
              className="text-xs mt-1 block"
              style={{ color: codeCopied ? '#A0BADE' : '#7A93B8' }}
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
                consensusStreak={session.consensus_streak}
                sessionId={session.id}
                deletedParticipantIds={deletedParticipantIds}
                onReveal={handleReveal}
                onNextRound={handleNextRound}
              />
            ) : (
              /* Før oppstart: vis deltakerliste + "Start sesjon"-knapp */
              <PreStartPanel
                participants={participants}
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
