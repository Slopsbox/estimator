import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VotePage } from '../../pages/Vote';

// ── Mock: useConfetti ──────────────────────────────────────────────────────────
vi.mock('../../hooks/useConfetti', () => ({
  useConfetti: () => ({ triggerConfetti: vi.fn() }),
}));

// ── Mock: supabase ─────────────────────────────────────────────────────────────
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
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
    expect(screen.getByRole('button', { name: /xs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gull/i })).toBeInTheDocument();
  });

  it('Stem-knappen er disabled inntil størrelse og verdi er valgt', () => {
    renderVote();

    expect(screen.getByRole('button', { name: /stem/i })).toBeDisabled();
  });
});
