import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { VotePage } from '../../pages/Vote';
import { LAST_USED_NAME_STORAGE_KEY } from '../../lib/localStorage';

// ── Mock: useConfetti ──────────────────────────────────────────────────────────
vi.mock('../../hooks/useConfetti', () => ({
  useConfetti: () => ({ triggerConfetti: vi.fn() }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
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
let mockOwnVote: Record<string, unknown> | null = null;
let mockRoundParticipant: Record<string, unknown> | null = null;
let mockRealtimeOwnVote: Record<string, unknown> | null = null;
const mockLogout = vi.fn();
const mockNavigate = vi.fn();
const mockCastVote = vi.fn();
const mockRetractVote = vi.fn();
const mockClaimRound = vi.fn();
const mockLeaveSession = vi.fn();

vi.mock('../../hooks/useSessionPresence', () => ({
  useSessionPresence: vi.fn(() => ({ presentParticipantIds: new Set(), connectionState: 'connected', presenceReady: true })),
}));

vi.mock('../../hooks/useRealtimeVotes', () => ({
  useRealtimeVotes: () => ({ votes: mockRealtimeOwnVote ? [mockRealtimeOwnVote] : [], ownVote: mockRealtimeOwnVote, revealed: Boolean(mockSession?.votes_revealed), refetch: vi.fn() }),
}));

vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({
    session: mockSession,
    localParticipant: mockLocalParticipant,
    ownVote: mockOwnVote,
    roundParticipant: mockRoundParticipant,
    loading: false,
    error: null,
    initialized: mockInitialized,
    restoreStatus: mockInitialized ? 'ready' : 'initializing',
    createSession: vi.fn(),
    joinSession: vi.fn(),
    startSession: vi.fn(),
    updateParticipantName: vi.fn(),
    revealVotes: vi.fn(),
    nextRound: vi.fn(),
    endSession: vi.fn(),
    logout: mockLogout,
    leaveSession: mockLeaveSession,
    claimRound: mockClaimRound,
    castVote: mockCastVote,
    retractVote: mockRetractVote,
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
    mockOwnVote = null;
    mockRoundParticipant = null;
    mockRealtimeOwnVote = null;
    mockLogout.mockReset();
    mockNavigate.mockReset();
    mockClaimRound.mockReset();
    mockClaimRound.mockResolvedValue({ ok: true });
    mockLeaveSession.mockReset();
    mockLeaveSession.mockResolvedValue({ ok: true });
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

  it('redirecter fasilitator bort fra participant-siden', async () => {
    mockSession = { id: 'ses-1', status: 'active', current_round: 1, started: true, votes_revealed: false };
    mockLocalParticipant = { participantId: 'p-fac', sessionId: 'ses-1', name: 'Fac', role: 'facilitator' };

    renderVote();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'));
  });
});

describe('VotePage – venteskjerm (session.started === false)', () => {
  beforeEach(() => {
    mockInitialized = true;
    mockNavigate.mockReset();
    mockOwnVote = null;
    mockRoundParticipant = null;
    mockRealtimeOwnVote = null;
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
    localStorage.setItem(LAST_USED_NAME_STORAGE_KEY, 'Ola');

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
    localStorage.setItem(LAST_USED_NAME_STORAGE_KEY, 'Kari');

    renderVote();

    expect(screen.getByText(/Kari/)).toBeInTheDocument();
    expect(screen.getByText('WXYZ')).toBeInTheDocument();
  });
});

describe('VotePage – stemmeform (session.started === true)', () => {
  beforeEach(() => {
    mockInitialized = true;
    mockNavigate.mockReset();
    mockClaimRound.mockReset();
    mockClaimRound.mockResolvedValue({ ok: true });
    mockOwnVote = null;
    mockRoundParticipant = null;
    mockRealtimeOwnVote = null;
    localStorage.setItem(LAST_USED_NAME_STORAGE_KEY, 'Ola');
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

  it('viser resultater ved reveal selv uten egen stemme', () => {
    mockSession = { ...mockSession, votes_revealed: true };
    renderVote();
    expect(screen.getByRole('heading', { name: /resultater/i })).toBeInTheDocument();
    expect(screen.queryByText('Din stemme')).not.toBeInTheDocument();
  });

  it('går rett til venteskjerm når restore har en eksisterende stemme', () => {
    mockOwnVote = { id: 'v-1', session_id: 'ses-1', participant_id: 'p-1', round: 1, size: 'l', value: 'silver', created_at: '' };
    mockRoundParticipant = { reestimate_used: false };
    renderVote();
    expect(screen.getByText('Stemme registrert!')).toBeInTheDocument();
    expect(screen.queryByText('Din stemme')).not.toBeInTheDocument();
  });

  it('claimer aktiv runde når round membership mangler', async () => {
    mockClaimRound.mockResolvedValue({ ok: true });
    renderVote();
    await waitFor(() => expect(mockClaimRound).toHaveBeenCalledTimes(1));
  });

  it('retryer claim etter transient feil og blokkerer stemmegivning frem til claim lykkes', async () => {
    vi.useFakeTimers();
    try {
      mockClaimRound
        .mockResolvedValueOnce({ ok: false, message: 'Kunne ikke klargjøre runden. Prøv igjen.' })
        .mockResolvedValueOnce({ ok: true });
      const { rerender } = renderVote();
      await act(async () => { await Promise.resolve(); });
      expect(mockClaimRound).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /stem/i })).toBeDisabled();

      await act(async () => {
        vi.advanceTimersByTime(2000);
        await Promise.resolve();
      });
      expect(mockClaimRound).toHaveBeenCalledTimes(2);
      mockRoundParticipant = { session_id: 'ses-1', round: 1, participant_id: 'p-1', joined_at: '', reestimate_used: false };
      rerender(<MemoryRouter><VotePage /></MemoryRouter>);
      vi.useRealTimers();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /størrelse M/i }));
      await user.click(screen.getByRole('button', { name: /verdi gull/i }));
      expect(screen.getByRole('button', { name: /stem/i })).not.toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('bruker realtime ownVote når RPC-responsen var tvetydig', () => {
    mockRoundParticipant = { reestimate_used: false };
    mockRealtimeOwnVote = { id: 'v-rt', session_id: 'ses-1', participant_id: 'p-1', round: 1, size: 'l', value: 'gold', created_at: '' };

    renderVote();

    expect(screen.getByText('Stemme registrert!')).toBeInTheDocument();
  });

  it('bruker leaveSession når deltakeren eksplisitt forlater', async () => {
    const user = userEvent.setup();
    mockRoundParticipant = { reestimate_used: false };
    mockLeaveSession.mockResolvedValue({ ok: true });
    renderVote();

    await user.click(screen.getByRole('button', { name: /forlat sesjon/i }));

    await waitFor(() => expect(mockLeaveSession).toHaveBeenCalledTimes(1));
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/');
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
    mockOwnVote = null;
    mockCastVote.mockReset();
    mockCastVote.mockImplementation(async ({ size, value }) => {
      mockOwnVote = { id: 'vote-1', session_id: 'ses-1', participant_id: 'p-1', round: 1, size, value, created_at: '' };
      return { ok: true };
    });
    mockRetractVote.mockReset();
    mockRetractVote.mockImplementation(async () => {
      mockOwnVote = null;
      mockRoundParticipant = { reestimate_used: true };
      return { ok: true };
    });
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
    mockRoundParticipant = { reestimate_used: false };
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
    await user.click(screen.getByRole('button', { name: /amalieknappen/i }));

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
    await user.click(screen.getByRole('button', { name: /amalieknappen/i }));

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

  it('beholder den registrerte stemmen og viser feil når sletting feiler', async () => {
    const user = userEvent.setup();
    mockRetractVote.mockResolvedValue({ ok: false, message: 'Kunne ikke endre stemmen. Prøv igjen.' });
    renderVote();

    await user.click(screen.getByRole('button', { name: /størrelse M/i }));
    await user.click(screen.getByRole('button', { name: /verdi gull/i }));
    await user.click(screen.getByRole('button', { name: /stem/i }));
    await waitFor(() => expect(screen.getByText('Stemme registrert!')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /amalieknappen/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Kunne ikke endre stemmen. Prøv igjen.');
    expect(screen.getByText('Stemme registrert!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /amalieknappen/i })).toBeInTheDocument();
  });
});
