import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { VotePage } from '../../pages/Vote';

// ── Mock: useConfetti ──────────────────────────────────────────────────────────
vi.mock('../../hooks/useConfetti', () => ({
  useConfetti: () => ({ triggerConfetti: vi.fn() }),
}));

// ── Mock: supabase ─────────────────────────────────────────────────────────────
// Chainable delete-kjede: .delete().eq().eq().eq() → Promise.resolve({ error: null })
const mockDeleteChain = {
  eq: vi.fn(),
  then: vi.fn().mockImplementation((cb: (v: { error: null }) => void) => {
    cb({ error: null });
    return Promise.resolve({ error: null });
  }),
};
mockDeleteChain.eq.mockReturnValue(mockDeleteChain);

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn(() => mockDeleteChain),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

// ── Mock: useSession (konfigurerbar per test) ─────────────────────────────────
let mockInitialized = true;
let mockSession: Record<string, unknown> | null = null;
let mockLocalParticipant: Record<string, unknown> | null = null;
const mockLogout = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({
    session: mockSession,
    localParticipant: mockLocalParticipant,
    loading: false,
    error: null,
    initialized: mockInitialized,
    createSession: vi.fn(),
    joinSession: vi.fn(),
    startSession: vi.fn(),
    updateParticipantName: vi.fn(),
    revealVotes: vi.fn(),
    nextRound: vi.fn(),
    endSession: vi.fn(),
    logout: mockLogout,
  }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Hjelpefunksjon ─────────────────────────────────────────────────────────────
function renderVote() {
  return render(
    <MemoryRouter>
      <VotePage />
    </MemoryRouter>,
  );
}

describe('VotePage – redirect-logikk', () => {
  beforeEach(() => {
    mockInitialized = true;
    mockSession = null;
    mockLocalParticipant = null;
    mockLogout.mockReset();
    mockNavigate.mockReset();
    sessionStorage.clear();
  });

  it('redirecter til /join når initialized=true og ingen sesjon/deltaker', async () => {
    mockInitialized = true;
    mockSession = null;
    mockLocalParticipant = null;

    renderVote();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/join');
    });
  });

  it('redirecter IKKE til /join mens initialized=false (gjenoppretting pågår)', async () => {
    mockInitialized = false;
    mockSession = null;
    mockLocalParticipant = null;

    renderVote();

    // Gi React tid til å prosessere effects
    await new Promise((r) => setTimeout(r, 50));

    expect(mockNavigate).not.toHaveBeenCalledWith('/join');
  });

  it('redirecter IKKE til /join når sesjon finnes (selv om initialized=true)', async () => {
    mockInitialized = true;
    mockSession = {
      id: 'ses-1',
      status: 'active',
      current_round: 1,
      join_code: 'ABCD',
      votes_revealed: false,
      started: true,
    };
    mockLocalParticipant = {
      participantId: 'p-1',
      sessionId: 'ses-1',
      name: 'Ola',
      role: 'participant',
    };

    renderVote();

    await new Promise((r) => setTimeout(r, 50));

    expect(mockNavigate).not.toHaveBeenCalledWith('/join');
  });
});

describe('VotePage – venteskjerm (session.started === false)', () => {
  beforeEach(() => {
    mockInitialized = true;
    mockNavigate.mockReset();
  });

  it('viser venteskjerm når session.started er false', () => {
    mockSession = {
      id: 'ses-1',
      status: 'active',
      current_round: 1,
      join_code: 'ABCD',
      votes_revealed: false,
      started: false,
    };
    mockLocalParticipant = {
      participantId: 'p-1',
      sessionId: 'ses-1',
      name: 'Ola',
      role: 'participant',
    };
    sessionStorage.setItem('estimering_vote_name', 'Ola');

    renderVote();

    expect(screen.getByText(/venter på fasilitator/i)).toBeInTheDocument();
    expect(screen.getByText(/ABCD/)).toBeInTheDocument();
  });

  it('viser deltakers navn i venteskjermen', () => {
    mockSession = {
      id: 'ses-1',
      status: 'active',
      current_round: 2,
      join_code: 'WXYZ',
      votes_revealed: false,
      started: false,
    };
    mockLocalParticipant = {
      participantId: 'p-2',
      sessionId: 'ses-1',
      name: 'Kari',
      role: 'participant',
    };
    sessionStorage.setItem('estimering_vote_name', 'Kari');

    renderVote();

    expect(screen.getByText(/Kari/)).toBeInTheDocument();
    expect(screen.getByText('WXYZ')).toBeInTheDocument();
  });
});

describe('VotePage – stemmeform (session.started === true)', () => {
  beforeEach(() => {
    mockInitialized = true;
    mockNavigate.mockReset();
    sessionStorage.setItem('estimering_vote_name', 'Ola');
    mockSession = {
      id: 'ses-1',
      status: 'active',
      current_round: 1,
      join_code: 'ABCD',
      votes_revealed: false,
      started: true,
    };
    mockLocalParticipant = {
      participantId: 'p-1',
      sessionId: 'ses-1',
      name: 'Ola',
      role: 'participant',
    };
  });

  it('viser stemmeform med størrelse- og verdi-knapper', () => {
    renderVote();

    expect(screen.getByText('Din stemme')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /størrelse XS/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verdi gull/i })).toBeInTheDocument();
  });

  it('Stem-knappen er disabled inntil størrelse og verdi er valgt', () => {
    renderVote();

    expect(screen.getByRole('button', { name: /stem/i })).toBeDisabled();
  });
});

// ── VotePage – Amalieknappen ─────────────────────────────────

describe('VotePage – Amalieknappen', () => {
  /**
   * For disse testene simulerer vi State B (hasVoted=true, !revealed).
   * useRealtimeVotes mock returnerer revealed=false.
   * Vi "jukser" oss inn i State B ved å:
   *   1. Rendre siden i State A (stemmeform)
   *   2. Klikke Stem (som kaller handleVote → setter hasVoted=true via mock)
   *
   * Enklere strategi: Vi tester VoteAwaitReveal-komponenten direkte i
   * VoteScreens.test.tsx for knapp-opptreden. Her tester vi integrasjonen:
   * at VotePage kaller delete og navigerer tilbake til VoteForm.
   */

  beforeEach(() => {
    mockInitialized = true;
    mockNavigate.mockReset();
    mockDeleteChain.eq.mockClear();
    // Sett opp aktiv sesjon
    mockSession = {
      id: 'ses-1',
      status: 'active',
      current_round: 1,
      join_code: 'ABCD',
      votes_revealed: false,
      started: true,
    };
    mockLocalParticipant = {
      participantId: 'p-1',
      sessionId: 'ses-1',
      name: 'Ola',
      role: 'participant',
    };
  });

  it('viser Amalieknappen i State B (etter stemme, før reveal)', async () => {
    const user = userEvent.setup();
    renderVote();

    // Velg størrelse og verdi i VoteForm
    await user.click(screen.getByRole('button', { name: /størrelse M/i }));
    await user.click(screen.getByRole('button', { name: /verdi gull/i }));
    await user.click(screen.getByRole('button', { name: /stem/i }));

    // Nå er vi i State B – VoteAwaitReveal
    await waitFor(() => {
      expect(screen.getByText('Stemme registrert!')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /amalieknappen/i })).toBeInTheDocument();
  });

  it('klikk på Amalieknappen sender bruker tilbake til stemmeform', async () => {
    const user = userEvent.setup();
    renderVote();

    // Gå til State B
    await user.click(screen.getByRole('button', { name: /størrelse M/i }));
    await user.click(screen.getByRole('button', { name: /verdi gull/i }));
    await user.click(screen.getByRole('button', { name: /stem/i }));

    await waitFor(() => {
      expect(screen.getByText('Stemme registrert!')).toBeInTheDocument();
    });

    // Klikk Amalieknappen
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /amalieknappen/i }));
    });

    // Skal være tilbake på stemmeform (State A)
    await waitFor(() => {
      expect(screen.getByText('Din stemme')).toBeInTheDocument();
    });
  });

  it('Amalieknappen forsvinner etter bruk (kan ikke brukes to ganger)', async () => {
    const user = userEvent.setup();
    renderVote();

    // Gå til State B
    await user.click(screen.getByRole('button', { name: /størrelse M/i }));
    await user.click(screen.getByRole('button', { name: /verdi gull/i }));
    await user.click(screen.getByRole('button', { name: /stem/i }));

    await waitFor(() => {
      expect(screen.getByText('Stemme registrert!')).toBeInTheDocument();
    });

    // Bruk Amalieknappen
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /amalieknappen/i }));
    });

    // Stem på nytt
    await waitFor(() => {
      expect(screen.getByText('Din stemme')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /størrelse M/i }));
    await user.click(screen.getByRole('button', { name: /verdi gull/i }));
    await user.click(screen.getByRole('button', { name: /stem/i }));

    // Tilbake i State B – Amalieknappen skal nå være borte
    await waitFor(() => {
      expect(screen.getByText('Stemme registrert!')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /amalieknappen/i })).not.toBeInTheDocument();
  });
});
