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
  left_at: null,
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

  it('viser forklarende re-estimeringsstatus etter avsløring', () => {
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
    expect(screen.getByRole('status')).toHaveTextContent('Ta en prat før dere går videre');
    expect(screen.getByRole('status')).toHaveTextContent('Stemmene spriker nok til at saken bør estimeres på nytt.');
    expect(screen.queryByRole('region', { name: /teamets risikovurdering/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /prioriteringsanbefaling/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /estimer på nytt/i })).toBeInTheDocument();
  });

  it('viser ikke resultatstatus før avsløring', () => {
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
    expect(screen.queryByRole('region', { name: /teamets risikovurdering/i })).not.toBeInTheDocument();
  });

  it('beholder prioriteringsanbefalingen ved liten forskjell', () => {
    const p = [makeParticipant('1', 'Ola'), makeParticipant('2', 'Kari')];
    const v = [makeVote('1', 'm', 'silver'), makeVote('2', 'l', 'silver')];
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

    expect(screen.getByRole('status')).toHaveTextContent('Resultatet er klart');
    expect(screen.getByRole('status')).toHaveTextContent('Stemmene er nær nok hverandre til å gå videre.');
    expect(screen.getByRole('region', { name: /prioriteringsanbefaling/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ny runde/i })).toBeInTheDocument();
  });

  it('viser ikke streak-badge', () => {
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
      />,
    );
    expect(screen.queryByText(/runder med konsensus/)).not.toBeInTheDocument();
  });

  it('viser "Re-estimerer" fra autoritativ round participation når deltaker ikke har stemme', () => {
    const p = [makeParticipant('1', 'Ola')];
    const reestimatingParticipantIds = new Set(['1']);
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={[]}
        votedCount={0}
        totalCount={1}
        reestimatingParticipantIds={reestimatingParticipantIds}
      />,
    );
    expect(screen.getByText(/Re-estimerer\.\.\./)).toBeInTheDocument();
    expect(screen.queryByText('Venter…')).not.toBeInTheDocument();
  });

  it('viser offline separat uten å overstyre en registrert stemme', () => {
    const p = [makeParticipant('1', 'Ola')];
    const v = [makeVote('1')];
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={v}
        votedCount={1}
        totalCount={1}
        presentParticipantIds={new Set()}
      />,
    );
    expect(screen.getByText('Klar ✓')).toBeInTheDocument();
    expect(screen.getByLabelText('Ola er offline')).toBeInTheDocument();
  });

  it('viser "Klar ✓" (ikke "Re-estimerer...") når deltaker har stemt på nytt etter Amalie', () => {
    const p = [makeParticipant('1', 'Ola')];
    const v = [makeVote('1', 'm', 'gold')];
    // Deltaker hadde slettet stemme men har nå stemt på nytt
    const reestimatingParticipantIds = new Set(['1']);
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={v}
        votedCount={1}
        totalCount={1}
        revealed={false}
        reestimatingParticipantIds={reestimatingParticipantIds}
      />,
    );
    // Stemmen vises (har stemme) → "Klar ✓", ikke "Re-estimerer..."
    expect(screen.getByText('Klar ✓')).toBeInTheDocument();
    expect(screen.queryByText(/Re-estimerer\.\.\./)).not.toBeInTheDocument();
  });

  it('viser "Venter…" når reestimatingParticipantIds ikke er oppgitt', () => {
    const p = [makeParticipant('1', 'Ola')];
    render(
      <VotesPanel
        {...defaultProps}
        participants={p}
        votes={[]}
        votedCount={0}
        totalCount={1}
        // reestimatingParticipantIds er ikke oppgitt
      />,
    );
    expect(screen.getByText('Venter…')).toBeInTheDocument();
  });

});
