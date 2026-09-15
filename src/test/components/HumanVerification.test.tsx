import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HumanVerification } from '../../components/HumanVerification';

const { getAccessToken, hasRecentTurnstileVerification, markTurnstileVerified, turnstileVerificationRemainingMs } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  hasRecentTurnstileVerification: vi.fn(),
  markTurnstileVerified: vi.fn(),
  turnstileVerificationRemainingMs: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({ getAccessToken }));
vi.mock('../../lib/turnstileAttestation', () => ({
  hasRecentTurnstileVerification,
  markTurnstileVerified,
  turnstileVerificationRemainingMs,
}));
vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
    <button type="button" onClick={() => onSuccess('challenge-token')}>Bekreft</button>
  ),
}));

describe('HumanVerification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getAccessToken.mockReset().mockResolvedValue('access-token');
    hasRecentTurnstileVerification.mockReset().mockReturnValue(false);
    markTurnstileVerified.mockReset();
    turnstileVerificationRemainingMs.mockReset().mockReturnValue(15 * 60 * 1000);
  });

  it('varmer opp identiteten mens brukeren løser verifiseringen', () => {
    render(<HumanVerification>{({ verified }) => <p>{verified ? 'Klar' : 'Venter'}</p>}</HumanVerification>);

    expect(screen.getByText('Venter')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Bekreft' })).toBeVisible();
    expect(getAccessToken).toHaveBeenCalledOnce();
  });

  it('låser opp innholdet etter serververifisering', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);

    render(<HumanVerification>{({ verified }) => <p>{verified ? 'Klar' : 'Venter'}</p>}</HumanVerification>);
    await user.click(screen.getByRole('button', { name: 'Bekreft' }));

    expect(await screen.findByText('Klar')).toBeVisible();
    expect(markTurnstileVerified).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/api/verify-turnstile', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
    }));
  });

  it('gjenbruker en fersk attest uten å vise widgeten eller hente identitet', () => {
    hasRecentTurnstileVerification.mockReturnValue(true);

    render(<HumanVerification>{({ verified }) => <p>{verified ? 'Klar' : 'Venter'}</p>}</HumanVerification>);

    expect(screen.getByText('Klar')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Bekreft' })).not.toBeInTheDocument();
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('låser handlingen igjen når den eksisterende attesten utløper', async () => {
    vi.useFakeTimers();
    try {
      hasRecentTurnstileVerification.mockReturnValue(true);
      turnstileVerificationRemainingMs.mockReturnValue(1_000);
      render(<HumanVerification>{({ verified }) => <p>{verified ? 'Klar' : 'Venter'}</p>}</HumanVerification>);

      expect(screen.getByText('Klar')).toBeVisible();
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });

      expect(screen.getByText('Venter')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Bekreft' })).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it('viser en feil og lar brukeren prøve med en ny challenge', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) } as Response);

    render(<HumanVerification>{({ verified }) => <p>{verified ? 'Klar' : 'Venter'}</p>}</HumanVerification>);
    await user.click(screen.getByRole('button', { name: 'Bekreft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/verifisering mislyktes/i);

    await user.click(screen.getByRole('button', { name: 'Bekreft' }));
    await waitFor(() => expect(screen.getByText('Klar')).toBeVisible());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('avbryter verifisering som henger', async () => {
    vi.useFakeTimers();
    try {
      getAccessToken.mockReturnValue(new Promise(() => undefined));
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      render(<HumanVerification>{({ verified }) => <p>{verified ? 'Klar' : 'Venter'}</p>}</HumanVerification>);

      await act(async () => {
        screen.getByRole('button', { name: 'Bekreft' }).click();
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(screen.getByRole('alert')).toHaveTextContent(/verifisering mislyktes/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

});
