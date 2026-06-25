import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoteWaiting } from '../../components/vote/VoteWaiting';
import { VoteAwaitReveal } from '../../components/vote/VoteAwaitReveal';
import { VoteResults } from '../../components/vote/VoteResults';
import type { Session, Vote, LocalParticipant } from '../../lib/types';

// ── Hjelpere ────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'ses-1',
    created_at: new Date().toISOString(),
    status: 'active',
    current_round: 1,
    join_code: 'ABCD',
    votes_revealed: false,
    started: false,
    consensus_streak: 0,
    facilitator_id: 'f-1',
    ...overrides,
  } as Session;
}

function makeVote(
  participantId: string,
  size: Vote['size'] = 'm',
  value: Vote['value'] = 'gold',
): Vote {
  return {
    id: `vote-${participantId}`,
    session_id: 'ses-1',
    participant_id: participantId,
    round: 1,
    size,
    value,
    created_at: new Date().toISOString(),
  };
}

const localParticipant: LocalParticipant = {
  participantId: 'p-1',
  sessionId: 'ses-1',
  name: 'Ola',
  role: 'participant',
};

// ── VoteWaiting ─────────────────────────────────────────────

describe('VoteWaiting', () => {
  it('viser "Venter på fasilitator…" header', () => {
    render(<VoteWaiting session={makeSession()} name="Ola" />);
    expect(screen.getByText(/venter på fasilitator/i)).toBeInTheDocument();
  });

  it('viser deltakers navn med hilsen', () => {
    render(<VoteWaiting session={makeSession()} name="Kari" />);
    expect(screen.getByText(/Kari 👋/)).toBeInTheDocument();
  });

  it('viser sesjonskode', () => {
    render(<VoteWaiting session={makeSession({ join_code: 'WXYZ' })} name="Ola" />);
    expect(screen.getByText('WXYZ')).toBeInTheDocument();
  });

  it('viser rundenummer', () => {
    render(<VoteWaiting session={makeSession({ current_round: 3 })} name="Ola" />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('viser "Sesjonskode"-label i info-kort', () => {
    render(<VoteWaiting session={makeSession()} name="Ola" />);
    expect(screen.getByText('Sesjonskode')).toBeInTheDocument();
  });

  it('viser "Runde"-label i info-kort', () => {
    render(<VoteWaiting session={makeSession()} name="Ola" />);
    expect(screen.getByText('Runde')).toBeInTheDocument();
  });

  it('viser pulserende status-tekst', () => {
    render(<VoteWaiting session={makeSession()} name="Ola" />);
    expect(screen.getByText('• Fasilitator starter snart •')).toBeInTheDocument();
  });

  it('viser "Deltager" header-label', () => {
    render(<VoteWaiting session={makeSession()} name="Ola" />);
    expect(screen.getByText('Deltager')).toBeInTheDocument();
  });
});

// ── VoteAwaitReveal ─────────────────────────────────────────

describe('VoteAwaitReveal', () => {
  it('viser "Stemme registrert!" header', () => {
    render(<VoteAwaitReveal name="Ola" selectedSize="m" selectedValue="gold" />);
    expect(screen.getByText('Stemme registrert!')).toBeInTheDocument();
  });

  it('viser deltakers navn med hilsen', () => {
    render(<VoteAwaitReveal name="Kari" selectedSize="l" selectedValue="silver" />);
    expect(screen.getByText(/Kari 👋/)).toBeInTheDocument();
  });

  it('viser valgt størrelse (uppercase) i oppsummeringen', () => {
    render(<VoteAwaitReveal name="Ola" selectedSize="xs" selectedValue="gold" />);
    expect(screen.getByText('XS')).toBeInTheDocument();
  });

  it('viser "Størrelse"-label i oppsummerings-kort', () => {
    render(<VoteAwaitReveal name="Ola" selectedSize="m" selectedValue="gold" />);
    expect(screen.getByText('Størrelse')).toBeInTheDocument();
  });

  it('viser "Verdi"-label i oppsummerings-kort', () => {
    render(<VoteAwaitReveal name="Ola" selectedSize="m" selectedValue="gold" />);
    expect(screen.getByText('Verdi')).toBeInTheDocument();
  });

  it('viser verdi-label (Gull) i oppsummeringen', () => {
    render(<VoteAwaitReveal name="Ola" selectedSize="m" selectedValue="gold" />);
    expect(screen.getByText('Gull')).toBeInTheDocument();
  });

  it('viser pulserende status-tekst', () => {
    render(<VoteAwaitReveal name="Ola" selectedSize="m" selectedValue="gold" />);
    expect(screen.getByText('• Venter på avsløring •')).toBeInTheDocument();
  });

  it('viser runde-badge når currentRound er oppgitt', () => {
    render(<VoteAwaitReveal name="Ola" selectedSize="m" selectedValue="gold" currentRound={2} />);
    expect(screen.getByText('Runde 2')).toBeInTheDocument();
  });

  it('viser ikke runde-badge når currentRound ikke er oppgitt', () => {
    render(<VoteAwaitReveal name="Ola" selectedSize="m" selectedValue="gold" />);
    expect(screen.queryByText(/Runde/)).not.toBeInTheDocument();
  });

  it('viser "Deltager" header-label', () => {
    render(<VoteAwaitReveal name="Ola" selectedSize="m" selectedValue="gold" />);
    expect(screen.getByText('Deltager')).toBeInTheDocument();
  });
});

// ── VoteResults ─────────────────────────────────────────────

describe('VoteResults', () => {
  const defaultProps = {
    name: 'Ola',
    votes: [] as Vote[],
    selectedSize: null,
    selectedValue: null,
    localParticipant: null,
    consensusStreak: 0,
  };

  it('viser "Resultater!" header', () => {
    render(<VoteResults {...defaultProps} />);
    expect(screen.getByText('Resultater!')).toBeInTheDocument();
  });

  it('viser antall stemmer (flertall)', () => {
    const votes = [makeVote('p-1'), makeVote('p-2')];
    render(<VoteResults {...defaultProps} votes={votes} />);
    expect(screen.getByText('2 stemmer avlagt')).toBeInTheDocument();
  });

  it('viser antall stemmer (entall)', () => {
    const votes = [makeVote('p-1')];
    render(<VoteResults {...defaultProps} votes={votes} />);
    expect(screen.getByText('1 stemme avlagt')).toBeInTheDocument();
  });

  it('viser 0 stemmer avlagt ved tom liste', () => {
    render(<VoteResults {...defaultProps} />);
    expect(screen.getByText('0 stemmer avlagt')).toBeInTheDocument();
  });

  it('viser "Deltager" header-label', () => {
    render(<VoteResults {...defaultProps} />);
    expect(screen.getByText('Deltager')).toBeInTheDocument();
  });

  it('viser runde-badge når currentRound er oppgitt', () => {
    render(<VoteResults {...defaultProps} currentRound={3} />);
    expect(screen.getByText('Runde 3')).toBeInTheDocument();
  });

  it('viser IKKE runde-badge når currentRound ikke er oppgitt', () => {
    render(<VoteResults {...defaultProps} />);
    expect(screen.queryByText(/Runde/)).not.toBeInTheDocument();
  });

  it('viser konsensus-banner ved konsensus', () => {
    const votes = [makeVote('p-1', 'm', 'gold'), makeVote('p-2', 'm', 'silver')];
    render(<VoteResults {...defaultProps} votes={votes} />);
    expect(screen.getByText(/Konsensus — alle stemte M!/i)).toBeInTheDocument();
  });

  it('viser IKKE konsensus-banner uten konsensus', () => {
    const votes = [makeVote('p-1', 'm', 'gold'), makeVote('p-2', 'l', 'silver')];
    render(<VoteResults {...defaultProps} votes={votes} />);
    expect(screen.queryByText(/Konsensus/)).not.toBeInTheDocument();
  });

  it('viser streak-badge ved consensusStreak >= 2', () => {
    const votes = [makeVote('p-1', 'm', 'gold')];
    render(<VoteResults {...defaultProps} votes={votes} consensusStreak={2} />);
    expect(screen.getByText(/2 runder med konsensus!/)).toBeInTheDocument();
  });

  it('viser IKKE streak-badge ved consensusStreak < 2', () => {
    const votes = [makeVote('p-1', 'm', 'gold')];
    render(<VoteResults {...defaultProps} votes={votes} consensusStreak={1} />);
    expect(screen.queryByText(/runder med konsensus/)).not.toBeInTheDocument();
  });

  it('markerer egen stemme med "Din"-badge', () => {
    const votes = [makeVote('p-1', 'm', 'gold'), makeVote('p-2', 'l', 'silver')];
    render(
      <VoteResults
        {...defaultProps}
        votes={votes}
        localParticipant={localParticipant}
      />,
    );
    expect(screen.getByText('Din')).toBeInTheDocument();
  });

  it('viser "Din stemme"-reminder ved valgt størrelse og verdi', () => {
    render(
      <VoteResults
        {...defaultProps}
        selectedSize="m"
        selectedValue="gold"
        votes={[makeVote('p-1', 'm', 'gold')]}
      />,
    );
    expect(screen.getByText('Din stemme')).toBeInTheDocument();
    expect(screen.getByText(/M · 🥇 Gull/)).toBeInTheDocument();
  });

  it('viser IKKE "Din stemme"-reminder uten valg', () => {
    render(<VoteResults {...defaultProps} />);
    expect(screen.queryByText('Din stemme')).not.toBeInTheDocument();
  });

  it('viser SpreadOMeter ved range > 0 (minst 2 ulike størrelser)', () => {
    const votes = [makeVote('p-1', 'xs', 'gold'), makeVote('p-2', 'xl', 'silver')];
    render(<VoteResults {...defaultProps} votes={votes} />);
    expect(screen.getByRole('region', { name: /havtilstand/i })).toBeInTheDocument();
  });

  it('viser PriorityMatrix når stemmer finnes', () => {
    const votes = [makeVote('p-1', 'xs', 'gold')];
    render(<VoteResults {...defaultProps} votes={votes} />);
    expect(screen.getByRole('region', { name: /prioriteringsanbefaling/i })).toBeInTheDocument();
  });

  it('sorterer stemmer etter størrelse (xs, s, m, l, xl)', () => {
    const votes = [
      makeVote('p-3', 'xl', 'bronze'),
      makeVote('p-1', 'xs', 'gold'),
      makeVote('p-2', 'm', 'silver'),
    ];
    render(
      <VoteResults
        {...defaultProps}
        votes={votes}
        localParticipant={localParticipant}
      />,
    );
    // Henter alle stemmekort-tekster i rekkefølge
    const items = screen.getAllByText(/^(XS|S|M|L|XL)$/).map((el) => el.textContent);
    expect(items).toEqual(['XS', 'M', 'XL']);
  });
});
