import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from '../../pages/Landing';

// Kontrollvariabler for TurnstileGate-mock
let mockLoadFailed = false;
let mockTimedOut = false;

// Mock TurnstileGate – gir full kontroll over widget-tilstand
vi.mock('../../components/TurnstileGate', () => ({
  TurnstileGate: ({ onSuccess }: { onSuccess: (token: string) => void }) => {
    if (mockLoadFailed || mockTimedOut) {
      return (
        <div>
          <p>{mockLoadFailed ? 'Verifisering feilet.' : 'Verifisering laster ikke.'}</p>
          <button type="button" data-testid="mock-retry" onClick={() => { /* no-op */ }}>
            Prøv igjen
          </button>
          <button
            type="button"
            data-testid="mock-bypass"
            onClick={() => onSuccess('bypass-network-error')}
          >
            Fortsett uten
          </button>
          <p>Nettverksproblemer kan forhindre verifisering</p>
        </div>
      );
    }
    return (
      <button type="button" data-testid="mock-turnstile" onClick={() => onSuccess('test-token')}>
        Verifiser (mock)
      </button>
    );
  },
}));

/** Hjelpefunksjon: lag en fetch-mock som returnerer gitt JSON */
function mockFetch(response: { success: boolean }, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  } as Response);
}

describe('LandingPage', () => {
  beforeEach(() => {
    mockLoadFailed = false;
    mockTimedOut = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('knappene er disabled før verifisering', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /deltager/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /fasilitator/i })).toBeDisabled();
  });

  it('viser veiledningstest om verifisering', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/bekreft at du er et menneske/i)).toBeInTheDocument();
  });

  it('knappene aktiveres når server-side verifisering lykkes', async () => {
    const user = userEvent.setup();
    mockFetch({ success: true });

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('mock-turnstile'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /deltager/i })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /fasilitator/i })).not.toBeDisabled();
    });
  });

  it('viser feilmelding og beholder disabled når server avviser tokenet', async () => {
    const user = userEvent.setup();
    mockFetch({ success: false }, 403);

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('mock-turnstile'));

    await waitFor(() => {
      expect(screen.getByText(/verifisering mislyktes/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /deltager/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /fasilitator/i })).toBeDisabled();
    });
  });

  it('nettverksfeil: knappene forblir disabled og vis feilmelding', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('mock-turnstile'));

    await waitFor(() => {
      expect(screen.getByText(/verifisering mislyktes/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /deltager/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /fasilitator/i })).toBeDisabled();
    });
  });

  it('bypass-token aktiverer knappene uten server-kall', async () => {
    const user = userEvent.setup();
    mockTimedOut = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('mock-bypass'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /deltager/i })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /fasilitator/i })).not.toBeDisabled();
    });
    // Ingen server-kall ved bypass
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('timeout-state viser "Verifisering laster ikke."', () => {
    mockTimedOut = true;

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Verifisering laster ikke.')).toBeInTheDocument();
    expect(screen.getByText(/nettverksproblemer kan forhindre verifisering/i)).toBeInTheDocument();
  });

  it('error-state viser "Verifisering feilet."', () => {
    mockLoadFailed = true;

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Verifisering feilet.')).toBeInTheDocument();
  });
});
