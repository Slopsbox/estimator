import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from '../../pages/Landing';

// Mock Turnstile – vi vil ikke laste ekstern script i tester
vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
    <button type="button" data-testid="mock-turnstile" onClick={() => onSuccess('test-token')}>
      Verifiser (mock)
    </button>
  ),
}));

describe('LandingPage', () => {
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

  it('knappene er disabled før verifisering', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /deltager/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /fasilitator/i })).toBeDisabled();
  });

  it('knappene aktiveres etter vellykket Turnstile-verifisering', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('mock-turnstile'));

    expect(screen.getByRole('button', { name: /deltager/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /fasilitator/i })).not.toBeDisabled();
  });

  it('viser veiledningstest om verifisering', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/bekreft at du er et menneske/i)).toBeInTheDocument();
  });
});
