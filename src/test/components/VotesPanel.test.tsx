import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VotesPanel } from '../../components/dashboard/VotesPanel';
import type { Participant, Vote } from '../../lib/types';

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
  onReveal: vi.fn(),
  onNextRound: vi.fn(),
};

// ── VotesPanel ─────────────────────────────────────────────

describe('VotesPanel', () => {
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
});
