import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoteWaiting } from '../../components/vote/VoteWaiting';
import { VoteAwaitReveal } from '../../components/vote/VoteAwaitReveal';
import { VoteResults } from '../../components/vote/VoteResults';
import type { Session, Vote } from '../../lib/types';

// ── Hjelpere ────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    activity_type: 'estimation',
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

  // ── Amalieknappen ──────────────────────────────────────────

  it('viser Amalieknappen når hasUsedAmalie=false og onAmalie er gitt', () => {
    render(
      <VoteAwaitReveal
        name="Ola"
        selectedSize="m"
        selectedValue="gold"
        hasUsedAmalie={false}
        onAmalie={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /amalieknappen/i })).toBeInTheDocument();
  });

  it('viser IKKE Amalieknappen når hasUsedAmalie=true', () => {
    render(
      <VoteAwaitReveal
        name="Ola"
        selectedSize="m"
        selectedValue="gold"
        hasUsedAmalie={true}
        onAmalie={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /amalieknappen/i })).not.toBeInTheDocument();
  });

  it('viser IKKE Amalieknappen når onAmalie ikke er gitt (default ingen re-estimering)', () => {
    render(
      <VoteAwaitReveal
        name="Ola"
        selectedSize="m"
        selectedValue="gold"
        hasUsedAmalie={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /amalieknappen/i })).not.toBeInTheDocument();
  });

  it('kaller onAmalie ved klikk på Amalieknappen', async () => {
    const user = userEvent.setup();
    const onAmalie = vi.fn();
    render(
      <VoteAwaitReveal
        name="Ola"
        selectedSize="m"
        selectedValue="gold"
        hasUsedAmalie={false}
        onAmalie={onAmalie}
      />,
    );
    await user.click(screen.getByRole('button', { name: /amalieknappen/i }));
    expect(onAmalie).toHaveBeenCalledTimes(1);
  });

  it('viser hjelpetekst "Endre stemmen din (1 gang per runde)" ved Amalieknappen', () => {
    render(
      <VoteAwaitReveal
        name="Ola"
        selectedSize="m"
        selectedValue="gold"
        hasUsedAmalie={false}
        onAmalie={vi.fn()}
      />,
    );
    expect(screen.getByText(/Endre stemmen din \(1 gang per runde\)/)).toBeInTheDocument();
  });

  it('skjuler hjelpeteksten når hasUsedAmalie=true', () => {
    render(
      <VoteAwaitReveal
        name="Ola"
        selectedSize="m"
        selectedValue="gold"
        hasUsedAmalie={true}
        onAmalie={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Endre stemmen din/)).not.toBeInTheDocument();
  });
});

// ── VoteResults ─────────────────────────────────────────────

describe('VoteResults', () => {
  const defaultProps = {
    name: 'Ola',
    votes: [] as Vote[],
    ownVote: null as Vote | null,
  };

  it('viser "Resultater!" header', () => {
    render(<VoteResults {...defaultProps} />);
    expect(screen.getByText('Resultater!')).toBeInTheDocument();
  });

  it('gjentar ikke antall stemmer i toppen', () => {
    render(<VoteResults {...defaultProps} votes={[makeVote('p-1'), makeVote('p-2')]} />);
    expect(screen.queryByText(/stemmer? avlagt/i)).not.toBeInTheDocument();
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

  it('viser én kompakt godkjent-status ved liten forskjell', () => {
    const votes = [makeVote('p-1', 'm', 'gold'), makeVote('p-2', 'm', 'silver')];
    render(<VoteResults {...defaultProps} votes={votes} />);
    expect(screen.getByRole('status')).toHaveTextContent('Dette er innenfor');
    expect(screen.queryByText(/Konsensus/)).not.toBeInTheDocument();
  });

  it('ber teamet ta en prat ved stor uenighet om verdi', () => {
    const votes = [makeVote('p-1', 'm', 'gold'), makeVote('p-2', 'm', 'bronze')];
    render(<VoteResults {...defaultProps} votes={votes} />);
    expect(screen.getByRole('status')).toHaveTextContent('Her må vi ta en prat og estimere på nytt');
  });

  it('ber teamet ta en prat ved minst to størrelsestrinn', () => {
    const votes = [makeVote('p-1', 's', 'silver'), makeVote('p-2', 'l', 'silver')];
    render(<VoteResults {...defaultProps} votes={votes} />);
    expect(screen.getByRole('status')).toHaveTextContent('Her må vi ta en prat og estimere på nytt');
  });

  it('viser ikke konsensus-streak', () => {
    render(<VoteResults {...defaultProps} votes={[makeVote('p-1', 'm', 'gold')]} />);
    expect(screen.queryByText(/runder med konsensus/)).not.toBeInTheDocument();
  });

  it('viser egen stemme én gang og filtrerer den fra andre stemmer', () => {
    const ownVote = makeVote('p-1', 'm', 'gold');
    const votes = [ownVote, makeVote('p-2', 'l', 'silver')];
    render(
      <VoteResults
        {...defaultProps}
        votes={votes}
        ownVote={ownVote}
      />,
    );
    expect(screen.getByText('Din stemme')).toBeInTheDocument();
    expect(screen.getByText('M · 🥇 Gull')).toBeInTheDocument();
    expect(screen.getAllByText(/M · 🥇 Gull/)).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Din stemme' })).toHaveStyle({
      background: 'var(--color-red-600)',
      color: 'rgb(255, 255, 255)',
    });
    expect(screen.getByRole('list', { name: /andre stemmer/i })).toHaveTextContent('L · 🥈 Sølv');
    expect(screen.getByRole('list', { name: /andre stemmer/i })).not.toHaveTextContent('M · 🥇 Gull');
  });

  it('bruker ownVote-ID til filtrering selv uten separat deltakeridentitet', () => {
    const ownVote = makeVote('p-1', 'm', 'gold');
    render(
      <VoteResults
        {...defaultProps}
        ownVote={ownVote}
        votes={[ownVote, makeVote('p-2', 'm', 'gold')]}
      />,
    );
    expect(screen.getByText('Din stemme')).toBeInTheDocument();
    expect(screen.getAllByText(/M · 🥇 Gull/)).toHaveLength(2);
    expect(screen.getByRole('list', { name: /andre stemmer/i }).querySelectorAll('li')).toHaveLength(1);
  });

  it('viser IKKE "Din stemme" uten egen stemme', () => {
    render(<VoteResults {...defaultProps} />);
    expect(screen.queryByText('Din stemme')).not.toBeInTheDocument();
  });

  it('viser ingen fordelingsmodul eller prioriteringsanbefaling', () => {
    const votes = [makeVote('p-1', 'xs', 'gold'), makeVote('p-2', 'xl', 'silver')];
    render(<VoteResults {...defaultProps} votes={votes} />);
    expect(screen.queryByRole('region', { name: /teamets risikovurdering/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /prioriteringsanbefaling/i })).not.toBeInTheDocument();
  });

  it('sorterer bare andre stemmer etter størrelse', () => {
    const ownVote = makeVote('p-1', 'xs', 'gold');
    const votes = [
      makeVote('p-3', 'xl', 'bronze'),
      ownVote,
      makeVote('p-2', 'm', 'silver'),
    ];
    render(
      <VoteResults
        {...defaultProps}
        votes={votes}
        ownVote={ownVote}
      />,
    );
    const items = screen.getByRole('list', { name: /andre stemmer/i })
      .querySelectorAll('li');
    expect([...items].map((item) => item.textContent)).toEqual(['M · 🥈 Sølv', 'XL · 🥉 Bronse']);
  });

  it('viser tomtilstand når ingen andre har stemt', () => {
    const ownVote = makeVote('p-1', 'm', 'gold');
    render(
      <VoteResults
        {...defaultProps}
        votes={[ownVote]}
        ownVote={ownVote}
      />,
    );
    expect(screen.getByText('Ingen andre stemmer.')).toBeInTheDocument();
  });
});
