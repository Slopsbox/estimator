import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../../pages/Dashboard';
import type { LocalParticipant, Participant, Session, Vote } from '../../lib/types';

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

const mockCreateSession = vi.fn();
const mockStartSession = vi.fn();
const mockRevealVotes = vi.fn();
const mockNextRound = vi.fn();
const mockEndSession = vi.fn();
const mockLogout = vi.fn();

vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({
    session: mockSession,
    localParticipant: mockLocalParticipant,
    loading: mockLoading,
    error: mockError,
    initialized: true,
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

vi.mock('../../hooks/useRealtimeParticipants', () => ({
  useRealtimeParticipants: () => ({
    participants: mockParticipants,
    loading: false,
  }),
}));

// ── Konfigurerbar useRealtimeVotes-state ──────────────────────────────────────
let mockVotes: Vote[] = [];

vi.mock('../../hooks/useRealtimeVotes', () => ({
  useRealtimeVotes: () => ({
    votes: mockVotes,
    loading: false,
    revealed: false,
    setRevealed: vi.fn(),
  }),
}));

// ── Hjelpdata ─────────────────────────────────────────────────────────────────
const FACILITATOR_PARTICIPANT: LocalParticipant = {
  participantId: 'p-fac-1',
  sessionId: 'ses-1',
  name: 'Fasilitator',
  role: 'facilitator',
};

const BASE_SESSION: Session = {
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
};

const PARTICIPANT_2: Participant = {
  id: 'p-2',
  session_id: 'ses-1',
  name: 'Kari',
  role: 'participant',
  joined_at: '2026-01-01T00:02:00Z',
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
  mockParticipants = [];
  mockVotes = [];

  mockCreateSession.mockReset();
  mockStartSession.mockReset();
  mockRevealVotes.mockReset();
  mockNextRound.mockReset();
  mockEndSession.mockReset();
  mockLogout.mockReset();
  mockNavigate.mockReset();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Opprett-sesjon-form
// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardPage – opprett sesjon (ingen sesjon/fasilitator)', () => {
  it('1. viser opprett-form når ingen sesjon/fasilitator', () => {
    mockSession = null;
    mockLocalParticipant = null;

    renderDashboard();

    expect(screen.getByRole('heading', { name: /opprett sesjon/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /opprett sesjon/i })).toBeInTheDocument();
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
    mockStartSession.mockResolvedValue(undefined);

    renderDashboard();

    await user.click(screen.getByRole('button', { name: /start sesjon/i }));

    expect(mockStartSession).toHaveBeenCalledTimes(1);
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
    mockVotes = [MOCK_VOTE_1]; // 1 av 2 har stemt
  });

  it('8. viser stemmestatus (X av Y har stemt)', () => {
    renderDashboard();

    expect(screen.getByText(/1 av 2 har stemt/i)).toBeInTheDocument();
  });

  it('9. "Vis resultater"-knapp kaller revealVotes', async () => {
    const user = userEvent.setup();
    mockRevealVotes.mockResolvedValue(undefined);

    renderDashboard();

    await user.click(screen.getByRole('button', { name: /vis resultater/i }));

    expect(mockRevealVotes).toHaveBeenCalledTimes(1);
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
    mockNextRound.mockResolvedValue(undefined);

    renderDashboard();

    await user.click(screen.getByRole('button', { name: /ny runde/i }));

    expect(mockNextRound).toHaveBeenCalledTimes(1);
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
    mockEndSession.mockResolvedValue(undefined);

    // Mock window.confirm til å returnere true
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderDashboard();

    await user.click(screen.getByRole('button', { name: /avslutt/i }));

    await waitFor(() => {
      expect(mockEndSession).toHaveBeenCalledTimes(1);
    });

    confirmSpy.mockRestore();
  });

  it('avbryt confirm gjør ingenting', async () => {
    const user = userEvent.setup();

    // Mock window.confirm til å returnere false
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderDashboard();

    await user.click(screen.getByRole('button', { name: /avslutt/i }));

    expect(mockEndSession).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
