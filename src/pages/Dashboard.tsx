import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ParticipantList } from '../components/ParticipantList';
import { VoteTable } from '../components/VoteTable';
import { useRealtimeParticipants } from '../hooks/useRealtimeParticipants';
import { useRealtimeVotes } from '../hooks/useRealtimeVotes';
import { useSession } from '../hooks/useSession';

type DashboardTab = 'participants' | 'votes';

/**
 * Fasilitator-dashboard.
 *
 * Flyt:
 * 1. Fasilitator skriver inn navn og starter sesjon
 * 2. Dashboard viser deltakere (Tab 1) og stemmer (Tab 2) i sanntid
 * 3. "Ny runde" inkrementerer current_round
 * 4. "Avslutt sesjon" setter status = completed
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const { session, localParticipant, loading, error, createSession, nextRound, endSession, logout } =
    useSession();

  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('participants');
  const [actionLoading, setActionLoading] = useState(false);

  const { participants, loading: participantsLoading } = useRealtimeParticipants(
    session?.id ?? null,
  );
  const { votes, loading: votesLoading } = useRealtimeVotes(
    session?.id ?? null,
    session?.current_round ?? 1,
  );

  // Om vi allerede er fasilitator (fra sessionStorage), vis dashboard direkte
  const isFacilitator = localParticipant?.role === 'facilitator';

  // Sesjon avsluttet → logg ut og gå til landing
  useEffect(() => {
    if (session?.status === 'completed' && isFacilitator) {
      // La fasilitator se "Sesjon avsluttet"-state før redirect
    }
  }, [session?.status, isFacilitator]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) {
      setNameError('Skriv inn et navn for å fortsette.');
      return;
    }
    setNameError(null);
    setCreating(true);
    const result = await createSession(name);
    setCreating(false);
    if (!result) return; // error er satt i hook
  };

  const handleNextRound = async () => {
    setActionLoading(true);
    await nextRound();
    setActionLoading(false);
  };

  const handleEndSession = async () => {
    const confirmed = window.confirm('Er du sikker på at du vil avslutte sesjonen?');
    if (!confirmed) return;
    setActionLoading(true);
    await endSession();
    setActionLoading(false);
    logout();
    navigate('/');
  };

  // ── Opprett sesjon ─────────────────────────────────────────
  if (!isFacilitator || !session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">
          <div className="text-center">
            <div className="text-4xl mb-3">🎯</div>
            <h1 className="text-2xl font-bold text-gray-900">Start sesjon</h1>
            <p className="mt-1 text-sm text-gray-500">
              Opprett en ny estimeringssesjon som fasilitator
            </p>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="facilitator-name" className="block text-sm font-medium text-gray-700 mb-1">
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
                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {nameError && <p className="mt-1 text-sm text-red-600">{nameError}</p>}
              {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={creating || loading}
              className={[
                'w-full py-3 px-6 rounded-xl font-semibold text-white transition-all',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
                creating || loading
                  ? 'bg-blue-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-95',
              ].join(' ')}
            >
              {creating || loading ? 'Starter…' : 'Start sesjon'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between pt-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fasilitator-dashboard</h1>
            <p className="text-sm text-gray-500">
              Runde {session.current_round} · {participants.length} deltaker
              {participants.length !== 1 ? 'e' : ''}
            </p>
          </div>
          <span
            className={[
              'text-xs px-2 py-1 rounded-full font-medium',
              session.status === 'active'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500',
            ].join(' ')}
          >
            {session.status === 'active' ? '● Aktiv' : '● Avsluttet'}
          </span>
        </div>

        {/* Handlingsknapper */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleNextRound}
            disabled={actionLoading || session.status !== 'active'}
            className={[
              'flex-1 py-3 px-4 rounded-xl font-semibold transition-all text-sm',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
              !actionLoading && session.status === 'active'
                ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            🔄 Ny runde
          </button>

          <button
            type="button"
            onClick={handleEndSession}
            disabled={actionLoading || session.status !== 'active'}
            className={[
              'flex-1 py-3 px-4 rounded-xl font-semibold transition-all text-sm',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500',
              !actionLoading && session.status === 'active'
                ? 'bg-red-600 text-white hover:bg-red-700 active:scale-95'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            🛑 Avslutt sesjon
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100">
            <button
              type="button"
              onClick={() => setActiveTab('participants')}
              className={[
                'flex-1 py-3 text-sm font-semibold transition-colors',
                activeTab === 'participants'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              👥 Deltakere ({participants.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('votes')}
              className={[
                'flex-1 py-3 text-sm font-semibold transition-colors',
                activeTab === 'votes'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              🗳️ Stemmer ({votes.length})
            </button>
          </div>

          <div className="p-4">
            {activeTab === 'participants' ? (
              <ParticipantList participants={participants} loading={participantsLoading} />
            ) : (
              <VoteTable votes={votes} participants={participants} loading={votesLoading} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
