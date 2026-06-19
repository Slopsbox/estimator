import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DeltagerJoinPage } from '../../pages/DeltagerJoin';

// Mock useSession
const mockJoinSession = vi.fn();
vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({
    joinSession: mockJoinSession,
    loading: false,
    session: null,
    localParticipant: null,
    error: null,
    createSession: vi.fn(),
    updateParticipantName: vi.fn(),
    revealVotes: vi.fn(),
    nextRound: vi.fn(),
    endSession: vi.fn(),
    logout: vi.fn(),
  }),
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('DeltagerJoinPage', () => {
  beforeEach(() => {
    mockJoinSession.mockReset();
    mockNavigate.mockReset();
  });

  it('viser ikon, heading og instruksjonstekst', () => {
    render(
      <MemoryRouter>
        <DeltagerJoinPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('🔑')).toBeInTheDocument();
    expect(screen.getByText('Skriv inn koden')).toBeInTheDocument();
    expect(screen.getByText(/fasilitator deler/i)).toBeInTheDocument();
  });

  it('viser disabled Bli med-knapp ved tomt input', () => {
    render(
      <MemoryRouter>
        <DeltagerJoinPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /bli med/i })).toBeDisabled();
  });

  it('aktiverer Bli med-knapp når 4 tegn er skrevet', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DeltagerJoinPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByRole('textbox'), 'ABCD');
    expect(screen.getByRole('button', { name: /bli med/i })).not.toBeDisabled();
  });

  it('normaliserer til store bokstaver', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DeltagerJoinPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByRole('textbox'), 'abcd');
    expect(screen.getByRole('textbox')).toHaveValue('ABCD');
  });

  it('navigerer til /vote ved vellykket join', async () => {
    const user = userEvent.setup();
    mockJoinSession.mockResolvedValueOnce(true);
    render(
      <MemoryRouter>
        <DeltagerJoinPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByRole('textbox'), 'ABCD');
    await user.click(screen.getByRole('button', { name: /bli med/i }));
    await waitFor(() => {
      expect(mockJoinSession).toHaveBeenCalledWith('ABCD');
      expect(mockNavigate).toHaveBeenCalledWith('/vote');
    });
  });

  it('viser feilmelding ved mislykket join', async () => {
    const user = userEvent.setup();
    mockJoinSession.mockResolvedValueOnce(false);
    render(
      <MemoryRouter>
        <DeltagerJoinPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByRole('textbox'), 'ZZZZ');
    await user.click(screen.getByRole('button', { name: /bli med/i }));
    await waitFor(() => {
      expect(screen.getByText(/feil kode/i)).toBeInTheDocument();
    });
  });
});
