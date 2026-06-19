import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoteTable } from '../../components/VoteTable';
import type { Participant, Vote } from '../../lib/types';

const makeParticipant = (id: string, name: string): Participant => ({
  id,
  session_id: 's1',
  name,
  role: 'participant',
  joined_at: new Date().toISOString(),
});

const makeVote = (participantId: string, override: Partial<Vote> = {}): Vote => ({
  id: `v-${participantId}`,
  session_id: 's1',
  participant_id: participantId,
  round: 1,
  size: 'm',
  value: 'gold',
  created_at: new Date().toISOString(),
  ...override,
});

describe('VoteTable', () => {
  it('viser lasteindikator under lasting', () => {
    render(<VoteTable votes={[]} participants={[]} loading={true} />);
    expect(screen.getByText(/laster/i)).toBeInTheDocument();
  });

  it('viser tom-melding uten stemmer', () => {
    render(<VoteTable votes={[]} participants={[]} loading={false} />);
    expect(screen.getByText(/ingen stemmer/i)).toBeInTheDocument();
  });

  it('viser deltakernavn hentet fra participants', () => {
    const participants = [makeParticipant('p1', 'Alice')];
    const votes = [makeVote('p1')];
    render(<VoteTable votes={votes} participants={participants} loading={false} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('viser — for ukjent deltaker', () => {
    const votes = [makeVote('ukjent-id')];
    render(<VoteTable votes={votes} participants={[]} loading={false} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('viser størrelse og verdi for stemme', () => {
    const participants = [makeParticipant('p1', 'Bob')];
    const votes = [makeVote('p1', { size: 'xl', value: 'silver' })];
    render(<VoteTable votes={votes} participants={participants} loading={false} />);
    expect(screen.getByText('XL')).toBeInTheDocument();
    expect(screen.getByText('🥈 Sølv')).toBeInTheDocument();
  });

  it('viser tabellheadere', () => {
    const participants = [makeParticipant('p1', 'Eve')];
    const votes = [makeVote('p1')];
    render(<VoteTable votes={votes} participants={participants} loading={false} />);
    expect(screen.getByText(/deltaker/i)).toBeInTheDocument();
    expect(screen.getByText(/størrelse/i)).toBeInTheDocument();
    expect(screen.getByText(/verdi/i)).toBeInTheDocument();
  });
});
