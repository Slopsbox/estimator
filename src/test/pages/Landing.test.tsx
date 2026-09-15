import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from '../../pages/Landing';

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('LandingPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    mockNavigate.mockReset();
  });

  it('viser tittel Estimat', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Estimat')).toBeInTheDocument();
  });

  it('viser Deltager- og Fasilitator-knapper', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /deltager/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fasilitator/i })).toBeInTheDocument();
  });

  it('rollevalget er tilgjengelig uten å vente på nettverk eller verifisering', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /deltager/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /fasilitator/i })).toBeEnabled();
    expect(screen.queryByText(/bekreft at du er et menneske/i)).not.toBeInTheDocument();
  });

  it('viser ingen separat prototypeinngang', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Squad Health.*prototype/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /prototype/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deltager' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Fasilitator' })).toBeEnabled();
  });

  it('navigerer deltaker til felles join og fasilitator til aktivitetsvelger', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /deltager/i }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/estimation/join');

    await user.click(screen.getByRole('button', { name: /fasilitator/i }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/facilitator');
  });
});
