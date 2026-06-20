import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PreStartPanel } from '../components/dashboard/PreStartPanel';
import { VotesPanel } from '../components/dashboard/VotesPanel';
import { useRealtimeParticipants } from '../hooks/useRealtimeParticipants';
import { useRealtimeVotes } from '../hooks/useRealtimeVotes';
import { useSession } from '../hooks/useSession';

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

  const { participants } = useRealtimeParticipants(session?.id ?? null);
  const { votes } = useRealtimeVotes(
    session?.id ?? null,
    session?.current_round ?? 1,
    session?.votes_revealed ?? false,
  );

  const isFacilitator = localParticipant?.role === 'facilitator';

  // Statisk liste – definert øverst for å unngå kondisjonell hook-kall
  const joinCodeDots = useMemo(() => [
    { color: 'oklch(0.56 0.14 165)' },
    { color: 'oklch(0.56 0.17 35)' },
    { color: 'oklch(0.55 0.15 270)' },
    { color: 'oklch(0.55 0.16 50)' },
  ], []);

  useEffect(() => {
    if (session?.status === 'completed' && isFacilitator) {
      logout();
      navigate('/');
    }
  }, [session?.status, isFacilitator, logout, navigate]);

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
    await revealVotes();
    setActionLoading(false);
  }, [revealVotes]);

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
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Fallback uten clipboard-tilgang
    }
  }, [session]);

  // ── Opprett sesjon ─────────────────────────────────────────
  if (!isFacilitator || !session) {
    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ background: 'oklch(0.965 0.012 165)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
            style={{ background: 'oklch(0.92 0.015 165)', color: 'oklch(0.30 0.08 165)' }}
            aria-label="Tilbake"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold" style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}>
            Fasilitator
          </h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-5 py-8">
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-6 space-y-5 animate-fadeUp"
            style={{ boxShadow: '0 2px 20px oklch(0.20 0.06 165 / 0.08)' }}
          >
            <div className="text-center">
              <div className="text-4xl mb-3">🎯</div>
              <h2 className="text-xl font-bold" style={{ fontFamily: 'Sora, sans-serif', color: 'oklch(0.20 0.06 165)' }}>
                Opprett sesjon
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'oklch(0.55 0.04 165)', fontFamily: 'DM Sans, sans-serif' }}>
                Opprett en ny estimeringssesjon
              </p>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label
                  htmlFor="facilitator-name"
                  className="block text-sm font-medium mb-1.5"
                  style={{ fontFamily: 'DM Sans, sans-serif', color: 'oklch(0.35 0.05 165)' }}
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
                  className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none transition-colors"
                  style={{
                    borderColor: 'oklch(0.88 0.02 165)',
                    color: 'oklch(0.20 0.06 165)',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                />
                {nameError && (
                  <p className="mt-1 text-sm" style={{ color: 'oklch(0.52 0.18 25)', fontFamily: 'DM Sans, sans-serif' }}>
                    {nameError}
                  </p>
                )}
                {error && (
                  <p className="mt-1 text-sm" style={{ color: 'oklch(0.52 0.18 25)', fontFamily: 'DM Sans, sans-serif' }}>
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={creating || loading}
                className="w-full py-4 rounded-2xl font-semibold text-white text-base transition-all focus:outline-none"
                style={{
                  fontFamily: 'Sora, sans-serif',
                  background: creating || loading ? 'oklch(0.70 0.04 165)' : 'oklch(0.30 0.08 165)',
                  cursor: creating || loading ? 'not-allowed' : 'pointer',
                  opacity: creating || loading ? 0.6 : 1,
                }}
              >
                {creating || loading ? 'Oppretter…' : 'Opprett sesjon'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Tell deltakere som har stemt (ikke fasilitator)
  const voterParticipants = participants.filter((p) => p.role === 'participant');
  const votedCount = votes.length;
  const totalCount = voterParticipants.length;
  const progressPct = totalCount > 0 ? (votedCount / totalCount) * 100 : 0;

  const sessionStarted = session.started;

  // ── Dashboard ──────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'oklch(0.965 0.012 165)' }}>
      {/* Mørk header */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{ background: 'oklch(0.24 0.08 165)' }}
      >
        <button
          type="button"
          onClick={() => { logout(); navigate('/'); }}
          className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
          style={{ background: 'oklch(0.32 0.08 165)', color: 'white' }}
          aria-label="Tilbake"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span
          className="text-base font-semibold text-white flex-1"
          style={{ fontFamily: 'Sora, sans-serif' }}
        >
          Fasilitator
        </span>

        {/* Runde-badge */}
        <span
          className="text-xs px-2.5 py-1 rounded-full font-medium"
          style={{
            background: 'oklch(0.32 0.08 165)',
            color: 'oklch(0.85 0.06 165)',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          Runde {session.current_round}
        </span>

        {/* Avslutt-knapp */}
        <button
          type="button"
          onClick={handleEndSession}
          disabled={actionLoading}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white transition-all focus:outline-none"
          style={{
            background: 'oklch(0.52 0.18 25)',
            fontFamily: 'Sora, sans-serif',
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
          style={{ background: 'oklch(0.88 0.03 165)' }}
        >
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${progressPct}%`,
              background: 'oklch(0.62 0.17 35)',
            }}
          />
        </div>
      )}

      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
        {/* Sesjonskode-kort */}
        <div
          className="rounded-2xl px-5 py-4 space-y-1"
          style={{ background: 'oklch(0.24 0.08 165)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <p
              className="text-xs"
              style={{ color: 'oklch(0.75 0.05 165)', fontFamily: 'DM Sans, sans-serif' }}
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
              style={{ fontFamily: 'Sora, sans-serif' }}
            >
              {session.join_code}
            </span>
            <span
              className="text-xs mt-1 block"
              style={{ color: codeCopied ? 'oklch(0.75 0.15 165)' : 'oklch(0.60 0.05 165)', fontFamily: 'DM Sans, sans-serif' }}
            >
              {codeCopied ? '✓ Kopiert!' : 'Trykk for å kopiere'}
            </span>
          </button>
        </div>

        {/* Kombinert deltaker + stemme-panel */}
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 2px 16px oklch(0.20 0.06 165 / 0.07)' }}
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
