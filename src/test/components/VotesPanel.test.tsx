import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VotesPanel } from '../../components/dashboard/VotesPanel';
import type { Participant, Vote } from '../../lib/types';

// ── Supabase-mock for cleanup-logikk ─────────────────────────
// vi.hoisted() sikrer at disse er tilgjengelige i vi.mock()-factory
const { mockDeleteFn } = vi.hoisted(() => {
  const mockDeleteFn = vi.fn().mockResolvedValue({ error: null });
  return { mockDeleteFn };
});

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnValue({ in: mockDeleteFn }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: vi.fn().mockImplementation((cb: (r: any) => void) => {
        cb({ data: [], error: null });
        return Promise.resolve();
      }),
    })),
  },
}));

// ── Hjelpere ────────────────────────────────────────────────

const makeParticipant = (id: string, name: string): Participant => ({
  id,
  session_id: 'sess-1',
  name,
  role: 'participant',
  joined_at: new Date().toISOString(),
});

const makeVote = (participantId: string, size: Vote['size'] = 'm', value: Vote['value'] = 'gold'): Vote => ({
  id: `vote-${participantId}`,
  session_id: 'sess-1',
  participant_id: participantId,
  round: 1,
  size,
  value,
  created_at: new Date().toISOString(),
});

const defaultProps = {
  participants: [] as Participant[],
  votes: [] as Vote[],
  revealed: false,
  votedCount: 0,
  totalCount: 0,
  actionLoading: false,
  consensusStreak: 0,
  sessionId: 'sess-1',
  onReveal: vi.fn(),
  onNextRound: vi.fn(),
};

// ── VotesPanel ─────────────────────────────────────────────

describe('VotesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('viser "Ingen deltakere ennå" når lista er tom', () => {
    render(<VotesPanel {...defaultProps} />);
    expect(screen.getByText('Ingen deltakere ennå.')).toBeInTheDocument();
  });

  it('viser stemmestatus "X av Y har stemt"', () => {
    const p = [makeParticipant('1', 'Ola'), makeParticipant('2', 'Kari')];
    render(<VotesPanel {...defaultProps} participants={p} votedCount={1} totalCount={2} />);
    expect(screen.getByText('1 av 2 har stemt')).toBeInTheDocument();
  });

  it('viser "Vis resultater"-knapp når ikke revealed', () => {
    const p = [makeParticipant('1', 'Ola')];
    const v = [makeVote('1')];
    render(<VotesPanel {...defaultProps} participants={p} votes={v} votedCount={1} totalCount={1} />);
    expect(screen.getByRole('button', { name: /vis resultater/i })).toBeInTheDocument();
  });

  it('"Vis resultater"-knapp er deaktivert når ingen har stemt', () => {
    render(<VotesPanel {...defaultProps} />);
    const btn = screen.getByRole('button', { name: /vis resultater/i });
    expect(btn).toBeDisabled();
  });

  it('kaller onReveal når "Vis resultater"-knappen klikkes', async () => {
    const user = userEvent.setup();
    const onReveal = vi.fn();
    const p = [makeParticipant('1', 'Ola')];
    const v = [makeVote('1')];
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={v}
        votedCount={1}
        totalCount={1}
        onReveal={onReveal}
      />,
    );
    await user.click(screen.getByRole('button', { name: /vis resultater/i }));
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it('viser "Ny runde"-knapp når revealed er true', () => {
    render(<VotesPanel {...defaultProps} revealed={true} />);
    expect(screen.getByRole('button', { name: /ny runde/i })).toBeInTheDocument();
  });

  it('kaller onNextRound når "Ny runde"-knappen klikkes', async () => {
    const user = userEvent.setup();
    const onNextRound = vi.fn();
    render(<VotesPanel {...defaultProps} revealed={true} onNextRound={onNextRound} />);
    await user.click(screen.getByRole('button', { name: /ny runde/i }));
    expect(onNextRound).toHaveBeenCalledOnce();
  });

  it('viser "Venter…" for deltaker uten stemme', () => {
    const p = [makeParticipant('1', 'Ola')];
    render(<VotesPanel {...defaultProps} participants={p} votedCount={0} totalCount={1} />);
    expect(screen.getByText('Venter…')).toBeInTheDocument();
  });

  it('viser "Klar ✓" for deltaker som har stemt, men stemme ikke er avslørt', () => {
    const p = [makeParticipant('1', 'Ola')];
    const v = [makeVote('1', 'm', 'gold')];
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={v}
        votedCount={1}
        totalCount={1}
        revealed={false}
      />,
    );
    expect(screen.getByText('Klar ✓')).toBeInTheDocument();
  });

  it('viser faktisk stemme (størrelse + medalje) etter avsløring', () => {
    const p = [makeParticipant('1', 'Ola')];
    const v = [makeVote('1', 'l', 'gold')];
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={v}
        votedCount={1}
        totalCount={1}
        revealed={true}
      />,
    );
    // L (uppercase) + gull-medalje
    expect(screen.getByText(/L 🥇/)).toBeInTheDocument();
  });

  it('viser PriorityMatrix når revealed=true og stemmer finnes', () => {
    const p = [makeParticipant('1', 'Ola')];
    const v = [makeVote('1', 'xs', 'gold')];
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={v}
        votedCount={1}
        totalCount={1}
        revealed={true}
      />,
    );
    // PriorityMatrix rendrer alltid en region med aria-label
    expect(screen.getByRole('region', { name: /prioriteringsanbefaling/i })).toBeInTheDocument();
  });

  it('viser IKKE PriorityMatrix når revealed=false', () => {
    const p = [makeParticipant('1', 'Ola')];
    const v = [makeVote('1', 'xs', 'gold')];
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={v}
        votedCount={1}
        totalCount={1}
        revealed={false}
      />,
    );
    expect(screen.queryByRole('region', { name: /prioriteringsanbefaling/i })).not.toBeInTheDocument();
  });

  it('deaktiverer "Ny runde"-knapp under actionLoading', () => {
    render(<VotesPanel {...defaultProps} revealed={true} actionLoading={true} />);
    expect(screen.getByRole('button', { name: /ny runde/i })).toBeDisabled();
  });

  it('viser SpreadOMeter etter avsløring når stemmer finnes', () => {
    // Trenger minst 2 stemmer med ulik størrelse (range > 0) — ved konsensus (range 0) skjules SpreadOMeter
    const p = [makeParticipant('1', 'Ola'), makeParticipant('2', 'Kari')];
    const v = [makeVote('1', 'xs', 'gold'), makeVote('2', 'xl', 'silver')];
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={v}
        votedCount={2}
        totalCount={2}
        revealed={true}
      />,
    );
    expect(screen.getByRole('region', { name: /havtilstand/i })).toBeInTheDocument();
  });

  it('viser IKKE SpreadOMeter før avsløring', () => {
    const p = [makeParticipant('1', 'Ola')];
    const v = [makeVote('1', 'xs', 'gold')];
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={v}
        votedCount={1}
        totalCount={1}
        revealed={false}
      />,
    );
    expect(screen.queryByRole('region', { name: /havtilstand/i })).not.toBeInTheDocument();
  });

  it('viser streak-badge når consensusStreak >= 2 og revealed er true', () => {
    const p = [makeParticipant('1', 'Ola')];
    const v = [makeVote('1', 'm', 'gold')];
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={v}
        votedCount={1}
        totalCount={1}
        revealed={true}
        consensusStreak={3}
      />,
    );
    expect(screen.getByText(/3 runder med konsensus!/)).toBeInTheDocument();
  });

  it('viser IKKE streak-badge når consensusStreak === 1', () => {
    const p = [makeParticipant('1', 'Ola')];
    const v = [makeVote('1', 'm', 'gold')];
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={v}
        votedCount={1}
        totalCount={1}
        revealed={true}
        consensusStreak={1}
      />,
    );
    expect(screen.queryByText(/runder med konsensus/)).not.toBeInTheDocument();
  });

  it('viser IKKE streak-badge når consensusStreak === 0', () => {
    const p = [makeParticipant('1', 'Ola')];
    const v = [makeVote('1', 'm', 'gold')];
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={v}
        votedCount={1}
        totalCount={1}
        revealed={true}
        consensusStreak={0}
      />,
    );
    expect(screen.queryByText(/runder med konsensus/)).not.toBeInTheDocument();
  });

  it('viser IKKE rydd-opp-knapp når ingen duplikater', () => {
    const p = [
      makeParticipant('1', 'Ola'),
      makeParticipant('2', 'Kari'),
    ];
    render(<VotesPanel {...defaultProps} participants={p} totalCount={2} />);
    expect(screen.queryByRole('button', { name: /rydd opp/i })).not.toBeInTheDocument();
  });

  it('viser rydd-opp-knapp med riktig antall når duplikater finnes', () => {
    // Lag to deltakere med samme navn (duplikat)
    const now = new Date();
    const earlier = new Date(now.getTime() - 10000).toISOString();
    const later = now.toISOString();
    const p: Participant[] = [
      { id: '1', session_id: 'sess-1', name: 'Ola', role: 'participant', joined_at: earlier },
      { id: '2', session_id: 'sess-1', name: 'Ola', role: 'participant', joined_at: later },
    ];
    render(<VotesPanel {...defaultProps} participants={p} totalCount={2} />);
    // aria-label er "Fjern 1 duplikat"
    expect(screen.getByRole('button', { name: /fjern 1 duplikat/i })).toBeInTheDocument();
    // teksten i knappen er "Rydd opp (1 duplikat)"
    expect(screen.getByText(/Rydd opp \(1 duplikat\)/)).toBeInTheDocument();
  });

  it('klikk på rydd-opp-knapp kaller supabase for å slette duplikater', async () => {
    const user = userEvent.setup();
    const now = new Date();
    const earlier = new Date(now.getTime() - 10000).toISOString();
    const later = now.toISOString();
    const p: Participant[] = [
      { id: '1', session_id: 'sess-1', name: 'Ola', role: 'participant', joined_at: earlier },
      { id: '2', session_id: 'sess-1', name: 'Ola', role: 'participant', joined_at: later },
    ];

    const { supabase } = await import('../../lib/supabase');
    // Mock fra returnerer deltakerne for cleanup-fetchen
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnValue({ in: mockDeleteFn }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: vi.fn().mockImplementation((cb: (r: any) => void) => {
        cb({ data: p, error: null });
        return Promise.resolve();
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any));

    render(<VotesPanel {...defaultProps} participants={p} totalCount={2} />);

    // aria-label er "Fjern 1 duplikat"
    const cleanupBtn = screen.getByRole('button', { name: /fjern 1 duplikat/i });
    await user.click(cleanupBtn);

    await waitFor(() => {
      expect(mockDeleteFn).toHaveBeenCalled();
    });
  });
});
