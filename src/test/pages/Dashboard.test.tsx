import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../../pages/Dashboard';
import type { LocalParticipant, Participant, RoundParticipant, Session, Vote } from '../../lib/types';

// ── Navigasjon-mock ────────────────────────────────────────────────────────────
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Konfigurerbar useSession-state ────────────────────────────────────────────
let mockSession: Session | null = null;
let mockLocalParticipant: LocalParticipant | null = null;
let mockLoading = false;
let mockError: string | null = null;
let mockRestoreStatus = 'ready';
let mockActivityType: 'estimation' | 'health_check' = 'estimation';

const mockCreateSession = vi.fn();
const mockStartSession = vi.fn<() => Promise<{ ok: true } | { ok: false; message: string }>>();
const mockRevealVotes = vi.fn<() => Promise<{ ok: true } | { ok: false; message: string }>>();
const mockNextRound = vi.fn<() => Promise<{ ok: true } | { ok: false; message: string }>>();
const mockEndSession = vi.fn<() => Promise<{ ok: true } | { ok: false; message: string }>>();
const mockLogout = vi.fn();

vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({
    session: mockSession,
    activityType: mockActivityType,
    localParticipant: mockLocalParticipant,
    loading: mockLoading,
    error: mockError,
    initialized: true,
    restoreStatus: mockRestoreStatus,
    createSession: mockCreateSession,
    joinSession: vi.fn(),
    startSession: mockStartSession,
    updateParticipantName: vi.fn(),
    revealVotes: mockRevealVotes,
    nextRound: mockNextRound,
    endSession: mockEndSession,
    logout: mockLogout,
  }),
}));

// ── Konfigurerbar useRealtimeParticipants-state ───────────────────────────────
let mockParticipants: Participant[] = [];
let mockRoundParticipants: RoundParticipant[] = [];
let mockPresentParticipantIds = new Set<string>();
let mockPresenceReady = true;
let mockPresenceConnectionState = 'connected';
let mockParticipantsLoading = false;
let mockRoundLoading = false;
let mockVotesLoading = false;
let mockDatasetError: string | null = null;
let mockVoteStatuses: Array<{ participant_id: string; has_voted: boolean }> = [];

vi.mock('../../hooks/useRealtimeParticipants', () => ({
  useRealtimeParticipants: () => ({
    participants: mockParticipants,
    loading: mockParticipantsLoading,
    error: mockDatasetError,
  }),
}));

vi.mock('../../hooks/useRealtimeRoundParticipants', () => ({
  useRealtimeRoundParticipants: () => ({ roundParticipants: mockRoundParticipants, loading: mockRoundLoading, error: mockDatasetError }),
}));

vi.mock('../../hooks/useSessionPresence', () => ({
  useSessionPresence: () => ({
    presentParticipantIds: mockPresentParticipantIds,
    presenceReady: mockPresenceReady,
    connectionState: mockPresenceConnectionState,
  }),
}));

// ── Konfigurerbar useRealtimeVotes-state ──────────────────────────────────────
let mockVotes: Vote[] = [];

vi.mock('../../hooks/useRealtimeVotes', () => ({
  useRealtimeVotes: () => ({
    votes: mockVotes,
    loading: mockVotesLoading,
    error: mockDatasetError,
    revealed: false,
    setRevealed: vi.fn(),
  }),
}));

vi.mock('../../hooks/useRoundVoteStatuses', () => ({
  useRoundVoteStatuses: () => ({ statuses: mockVoteStatuses, loading: mockVotesLoading, error: mockDatasetError }),
}));

// ── Hjelpdata ─────────────────────────────────────────────────────────────────
const FACILITATOR_PARTICIPANT: LocalParticipant = {
  participantId: 'p-fac-1',
  sessionId: 'ses-1',
  name: 'Fasilitator',
  role: 'facilitator',
};

const BASE_SESSION: Session = {
  activity_type: 'estimation',
  id: 'ses-1',
  status: 'active',
  current_round: 1,
  created_at: '2026-01-01T00:00:00Z',
  join_code: 'ABCD',
  votes_revealed: false,
  started: false,
  consensus_streak: 0,
};

const PARTICIPANT_1: Participant = {
  id: 'p-1',
  session_id: 'ses-1',
  name: 'Ola',
  role: 'participant',
  joined_at: '2026-01-01T00:01:00Z',
  left_at: null,
};

const PARTICIPANT_2: Participant = {
  id: 'p-2',
  session_id: 'ses-1',
  name: 'Kari',
  role: 'participant',
  joined_at: '2026-01-01T00:02:00Z',
  left_at: null,
};

const MOCK_VOTE_1: Vote = {
  id: 'v-1',
  session_id: 'ses-1',
  participant_id: 'p-1',
  round: 1,
  size: 'm',
  value: 'gold',
  created_at: '2026-01-01T00:03:00Z',
};

// ── Hjelpefunksjoner ──────────────────────────────────────────────────────────
function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

// ── Reset ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockSession = null;
  mockLocalParticipant = null;
  mockLoading = false;
  mockError = null;
  mockRestoreStatus = 'ready';
  mockActivityType = 'estimation';
  mockParticipants = [];
  mockRoundParticipants = [];
  mockPresentParticipantIds = new Set();
  mockPresenceReady = true;
  mockPresenceConnectionState = 'connected';
  mockVotes = [];
  mockVoteStatuses = [];
  mockParticipantsLoading = false;
  mockRoundLoading = false;
  mockVotesLoading = false;
  mockDatasetError = null;

  mockCreateSession.mockReset();
  mockStartSession.mockReset();
  mockStartSession.mockResolvedValue({ ok: true });
  mockRevealVotes.mockReset();
  mockRevealVotes.mockResolvedValue({ ok: true });
  mockNextRound.mockReset();
  mockNextRound.mockResolvedValue({ ok: true });
  mockEndSession.mockReset();
  mockEndSession.mockResolvedValue({ ok: true });
  mockLogout.mockReset();
  mockNavigate.mockReset();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Opprett-sesjon-form
// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardPage – opprett sesjon (ingen sesjon/fasilitator)', () => {
  it('viser estimeringsoppretting uten å koble health-rommet til estimeringsvisningen', () => {
    mockActivityType = 'health_check';
    mockSession = { ...BASE_SESSION, activity_type: 'health_check' };
    mockLocalParticipant = FACILITATOR_PARTICIPANT;

    renderDashboard();

    expect(screen.getByRole('heading', { name: /opprett sesjon/i })).toBeVisible();
    expect(screen.queryByText('ABCD')).not.toBeInTheDocument();
  });

  it('viser reconnect-status i stedet for create-form når cached identity finnes', () => {
    mockSession = null;
    mockLocalParticipant = FACILITATOR_PARTICIPANT;
    mockRestoreStatus = 'reconnecting';
    renderDashboard();

    expect(screen.getByText(/kobler til sesjonen på nytt/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /opprett sesjon/i })).not.toBeInTheDocument();
  });
  it('1. viser opprett-form når ingen sesjon/fasilitator', () => {
    mockSession = null;
    mockLocalParticipant = null;

    renderDashboard();

    expect(screen.getByRole('heading', { name: /opprett sesjon/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /opprett sesjon/i })).toBeInTheDocument();
  });

  it('viser autoritativ utløpt-status før ny fasilitator-sesjon', () => {
    mockRestoreStatus = 'invalid';
    renderDashboard();
    expect(screen.getByRole('alert')).toHaveTextContent(/forrige sesjon er utløpt/i);
  });

  it('2. validering: tomt navnefelt gir disabled knapp og ingen createSession-kall', async () => {
    const user = userEvent.setup();
    mockSession = null;
    mockLocalParticipant = null;

    renderDashboard();

    // Knappen er disabled når input er tomt
    const submitBtn = screen.getByRole('button', { name: /opprett sesjon/i });
    expect(submitBtn).toBeDisabled();

    // Klikk på disabled-knapp (userEvent lar det gå gjennom – men handleCreate ikke kalt)
    await user.click(submitBtn);

    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('3. submit kaller createSession med navn', async () => {
    const user = userEvent.setup();
    mockSession = null;
    mockLocalParticipant = null;
    mockCreateSession.mockResolvedValue(null);

    renderDashboard();

    await user.type(screen.getByPlaceholderText(/fasilitators navn/i), 'Ola Nordmann');
    await user.click(screen.getByRole('button', { name: /opprett sesjon/i }));

    expect(mockCreateSession).toHaveBeenCalledWith('Ola Nordmann');
  });

  it('4. loading-state disabler knappen', () => {
    mockSession = null;
    mockLocalParticipant = null;
    mockLoading = true;

    renderDashboard();

    const submitBtn = screen.getByRole('button', { name: /oppretter…/i });
    expect(submitBtn).toBeDisabled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Dashboard etter opprettelse (pre-start)
// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardPage – pre-start (session.started === false)', () => {
  beforeEach(() => {
    mockSession = { ...BASE_SESSION, started: false };
    mockLocalParticipant = FACILITATOR_PARTICIPANT;
    mockParticipants = [
      { ...PARTICIPANT_1, role: 'facilitator', name: 'Fasilitator', id: 'p-fac-1' },
      PARTICIPANT_1,
      PARTICIPANT_2,
    ];
  });

  it('5. viser sesjonskode-kort med join_code', () => {
    renderDashboard();

    expect(screen.getByText('ABCD')).toBeInTheDocument();
    expect(screen.getByText(/del med deltakere/i)).toBeInTheDocument();
  });

  it('6. viser PreStartPanel med deltakerliste', () => {
    renderDashboard();

    expect(screen.getByText(/venter på deltakere/i)).toBeInTheDocument();
    expect(screen.getByText('Ola')).toBeInTheDocument();
    expect(screen.getByText('Kari')).toBeInTheDocument();
  });

  it('7. "Start sesjon"-knapp kaller startSession', async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole('button', { name: /start sesjon/i }));

    expect(mockStartSession).toHaveBeenCalledTimes(1);
  });

  it('viser feilmeldingen fra mislykket start av sesjon', async () => {
    const user = userEvent.setup();
    mockStartSession.mockResolvedValue({ ok: false, message: 'Kunne ikke starte sesjonen. Prøv igjen.' });

    renderDashboard();

    await user.click(screen.getByRole('button', { name: /start sesjon/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Kunne ikke starte sesjonen. Prøv igjen.');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Dashboard etter start
// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardPage – etter start (session.started === true)', () => {
  beforeEach(() => {
    mockSession = { ...BASE_SESSION, started: true, votes_revealed: false };
    mockLocalParticipant = FACILITATOR_PARTICIPANT;
    mockParticipants = [PARTICIPANT_1, PARTICIPANT_2];
    mockRoundParticipants = [
      { session_id: 'ses-1', round: 1, participant_id: 'p-1', joined_at: '', reestimate_used: false },
      { session_id: 'ses-1', round: 1, participant_id: 'p-2', joined_at: '', reestimate_used: false },
    ];
    mockVotes = [MOCK_VOTE_1]; // 1 av 2 har stemt
    mockVoteStatuses = [{ participant_id: 'p-1', has_voted: true }, { participant_id: 'p-2', has_voted: false }];
  });

  it('8. viser stemmestatus (X av Y har stemt)', () => {
    renderDashboard();

    expect(screen.getByText(/1 av 2 har stemt/i)).toBeInTheDocument();
  });

  it('9. "Vis resultater"-knapp kaller revealVotes', async () => {
    const user = userEvent.setup();

    renderDashboard();

    await user.click(screen.getByRole('button', { name: /vis resultater/i }));

    expect(mockRevealVotes).toHaveBeenCalledTimes(1);
  });

  it('bruker anonymiserte vote-statuses før reveal, ikke full vote-data', () => {
    mockVotes = [];
    renderDashboard();
    expect(screen.getByText(/1 av 2 har stemt/i)).toBeInTheDocument();
    expect(screen.queryByText(/M 🥇/)).not.toBeInTheDocument();
  });

  it('viser dataset-status og blokkerer reveal ved loading eller fetch-feil', () => {
    mockParticipantsLoading = true;
    const { rerender } = renderDashboard();
    expect(screen.getByRole('status')).toHaveTextContent(/henter autoritative/i);
    expect(screen.getByRole('button', { name: /vis resultater/i })).toBeDisabled();

    mockParticipantsLoading = false;
    mockDatasetError = 'Kunne ikke hente data. Prøv igjen.';
    rerender(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent(/kunne ikke hente data/i);
    expect(screen.getByRole('button', { name: /vis resultater/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Avslutt' })).toBeEnabled();
  });

  it('10. etter reveal: viser stemmer med størrelse og medalje', () => {
    // Sett votes_revealed = true og ha en stemme
    mockSession = { ...BASE_SESSION, started: true, votes_revealed: true };
    mockParticipants = [PARTICIPANT_1];
    mockVotes = [MOCK_VOTE_1];

    renderDashboard();

    // VotesPanel viser "M 🥇" for stemmen m/gold
    expect(screen.getByText(/M 🥇/)).toBeInTheDocument();
  });

  it('11. "Ny runde"-knapp kaller nextRound (etter reveal)', async () => {
    const user = userEvent.setup();
    mockSession = { ...BASE_SESSION, started: true, votes_revealed: true };

    renderDashboard();

    await user.click(screen.getByRole('button', { name: /ny runde/i }));

    expect(mockNextRound).toHaveBeenCalledTimes(1);
  });

  it('teller ikke historisk membership som mangler fra rundens roster', () => {
    mockRoundParticipants = [mockRoundParticipants[0]];
    renderDashboard();
    expect(screen.getByText('1 av 1 har stemt')).toBeInTheDocument();
    expect(screen.queryByText('Kari')).not.toBeInTheDocument();
  });

  it('beholder offline round participant uten stemme i totalen', () => {
    mockVotes = [];
    mockVoteStatuses = [];
    mockPresentParticipantIds = new Set();
    renderDashboard();
    expect(screen.getByText('0 av 2 har stemt')).toBeInTheDocument();
    expect(screen.getByLabelText('Ola er offline')).toBeInTheDocument();
  });

  it('beholder offline round participant med stemme og stemmestatus', () => {
    mockPresentParticipantIds = new Set();
    renderDashboard();
    expect(screen.getByText('1 av 2 har stemt')).toBeInTheDocument();
    expect(screen.getByText('Klar ✓')).toBeInTheDocument();
    expect(screen.getByLabelText('Ola er offline')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Avslutt
// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardPage – avslutt', () => {
  beforeEach(() => {
    mockSession = { ...BASE_SESSION, started: false };
    mockLocalParticipant = FACILITATOR_PARTICIPANT;
    mockParticipants = [];
    mockVotes = [];
  });

  it('12. "Avslutt"-knapp kaller endSession etter confirm', async () => {
    const user = userEvent.setup();
    mockEndSession.mockResolvedValue({ ok: true });

    // Mock window.confirm til å returnere true
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderDashboard();

    await user.click(screen.getByRole('button', { name: 'Avslutt' }));

    await waitFor(() => {
      expect(mockEndSession).toHaveBeenCalledTimes(1);
    });

    confirmSpy.mockRestore();
  });

  it('tilbakeknappen avslutter sesjonen før den navigerer bort', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockEndSession.mockResolvedValue({ ok: true });
    renderDashboard();

    await user.click(screen.getByRole('button', { name: 'Avslutt sesjon og gå tilbake' }));

    await waitFor(() => expect(mockEndSession).toHaveBeenCalledOnce());
    expect(mockLogout).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('logger ikke ut eller navigerer når avslutting av sesjon feiler', async () => {
    const user = userEvent.setup();
    mockEndSession.mockResolvedValue({ ok: false, message: 'Kunne ikke avslutte sesjonen. Prøv igjen.' });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Avslutt' }));

    await waitFor(() => expect(mockEndSession).toHaveBeenCalledTimes(1));
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('avbryt confirm gjør ingenting', async () => {
    const user = userEvent.setup();

    // Mock window.confirm til å returnere false
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderDashboard();

    await user.click(screen.getByRole('button', { name: 'Avslutt' }));

    expect(mockEndSession).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
