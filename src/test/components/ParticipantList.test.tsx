import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ParticipantList } from '../../components/ParticipantList';
import type { Participant } from '../../lib/types';

const makeParticipant = (override: Partial<Participant> = {}): Participant => ({
  id: 'p1',
  session_id: 's1',
  name: 'Ola Nordmann',
  role: 'participant',
  joined_at: new Date().toISOString(),
  ...override,
});

describe('ParticipantList', () => {
  it('viser lasteindikator under lasting', () => {
    render(<ParticipantList participants={[]} loading={true} />);
    expect(screen.getByText(/laster/i)).toBeInTheDocument();
  });

  it('viser tom-melding når ingen deltakere og ikke laster', () => {
    render(<ParticipantList participants={[]} loading={false} />);
    expect(screen.getByText(/ingen deltakere/i)).toBeInTheDocument();
  });

  it('viser deltakernavn', () => {
    const participants = [
      makeParticipant({ id: 'p1', name: 'Alice' }),
      makeParticipant({ id: 'p2', name: 'Bob' }),
    ];
    render(<ParticipantList participants={participants} loading={false} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('viser fasilitator-badge for fasilitator', () => {
    const participants = [
      makeParticipant({ role: 'facilitator', name: 'Fasil' }),
    ];
    render(<ParticipantList participants={participants} loading={false} />);
    expect(screen.getByText('Fasilitator')).toBeInTheDocument();
  });

  it('viser deltaker-badge for vanlig deltaker', () => {
    const participants = [makeParticipant({ role: 'participant', name: 'Vanlig' })];
    render(<ParticipantList participants={participants} loading={false} />);
    expect(screen.getByText('Deltaker')).toBeInTheDocument();
  });
});
