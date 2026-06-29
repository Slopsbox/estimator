import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoteForm } from '../../components/vote/VoteForm';

const defaultProps = {
  name: 'Ola',
  currentRound: 1,
  selectedSize: null,
  selectedValue: null,
  submitting: false,
  submitError: null,
  onSelectSize: vi.fn(),
  onSelectValue: vi.fn(),
  onVote: vi.fn(),
  onBack: vi.fn(),
} as const;

describe('VoteForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // rAF: lagre callback men IKKE kjør den – lar fake setTimeout styre progress
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 0);
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('viser størrelses-knapper for alle størrelser', () => {
    render(<VoteForm {...defaultProps} />);
    expect(screen.getByRole('button', { name: /størrelse XS/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /størrelse S/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /størrelse M/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /størrelse L/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /størrelse XL/i })).toBeInTheDocument();
  });

  it('viser verdi-knapper for alle verdier', () => {
    render(<VoteForm {...defaultProps} />);
    expect(screen.getByRole('button', { name: /verdi bronse/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verdi sølv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verdi gull/i })).toBeInTheDocument();
  });

  it('kaller onSelectSize ved klikk på størrelse-knapp', async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    const user = userEvent.setup();
    const onSelectSize = vi.fn();
    render(<VoteForm {...defaultProps} onSelectSize={onSelectSize} />);
    await user.click(screen.getByRole('button', { name: /størrelse M/i }));
    expect(onSelectSize).toHaveBeenCalledWith('m');
  });

  it('kaller onSelectValue ved klikk på verdi-knapp', async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    const user = userEvent.setup();
    const onSelectValue = vi.fn();
    render(<VoteForm {...defaultProps} onSelectValue={onSelectValue} />);
    await user.click(screen.getByRole('button', { name: /verdi gull/i }));
    expect(onSelectValue).toHaveBeenCalledWith('gold');
  });

  it('viser hint-tekst "Hold inne for beskrivelse"', () => {
    render(<VoteForm {...defaultProps} />);
    expect(screen.getByText(/hold inne for beskrivelse/i)).toBeInTheDocument();
  });

  it('åpner bottom sheet med størrelse-info ved long press', async () => {
    render(<VoteForm {...defaultProps} />);

    const btn = screen.getByRole('button', { name: /størrelse XS/i });
    // Simuler mouseDown og la timeren gå
    act(() => {
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // Sheet skal nå være åpen med XS-info
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('~2 timer')).toBeInTheDocument();
    expect(screen.getByText('Triviell, ingen avhengigheter')).toBeInTheDocument();
  });

  it('åpner bottom sheet med verdi-info ved long press på gull-knapp', async () => {
    render(<VoteForm {...defaultProps} />);

    const btn = screen.getByRole('button', { name: /verdi gull/i });
    act(() => {
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Høy verdi, treffer OKR direkte.')).toBeInTheDocument();
    expect(screen.getByText('Prioriteres øverst.')).toBeInTheDocument();
  });

  it('lukker bottom sheet ved klikk på Lukk-knappen', async () => {
    render(<VoteForm {...defaultProps} />);

    // Åpne sheet
    const btn = screen.getByRole('button', { name: /størrelse M/i });
    act(() => {
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveStyle({ transform: 'translateY(0)' });

    // Klikk Lukk (real timers trengs for userEvent)
    vi.useRealTimers();
    vi.restoreAllMocks();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Lukk' }));

    expect(dialog).toHaveStyle({ transform: 'translateY(100%)' });
  });

  it('viser feilmelding ved submitError', () => {
    render(<VoteForm {...defaultProps} submitError="Noe gikk galt" />);
    expect(screen.getByText('Noe gikk galt')).toBeInTheDocument();
  });

  it('stem-knapp er deaktivert uten valg', () => {
    render(<VoteForm {...defaultProps} />);
    expect(screen.getByRole('button', { name: /stem/i })).toBeDisabled();
  });

  it('stem-knapp er aktiv med både størrelse og verdi valgt', () => {
    render(
      <VoteForm
        {...defaultProps}
        selectedSize="m"
        selectedValue="gold"
      />,
    );
    expect(screen.getByRole('button', { name: /stem/i })).not.toBeDisabled();
  });

  it('sheet inneholder eksempel-tekst for størrelse S', async () => {
    render(<VoteForm {...defaultProps} />);

    const btn = screen.getByRole('button', { name: /størrelse S/i });
    act(() => {
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByText('~1 dag')).toBeInTheDocument();
    expect(screen.getByText('Liten, minimale avhengigheter')).toBeInTheDocument();
  });

  it('sheet inneholder riktig verdi-info for bronse', async () => {
    render(<VoteForm {...defaultProps} />);

    const btn = screen.getByRole('button', { name: /verdi bronse/i });
    act(() => {
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByText('Nyttig sak, lav OKR-relevans.')).toBeInTheDocument();
    expect(screen.getByText('Tas når kapasitet tillater.')).toBeInTheDocument();
  });
});
