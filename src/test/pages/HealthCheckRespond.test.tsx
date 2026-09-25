import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  submit: vi.fn(),
  leaveSession: vi.fn(),
  clearLocalSession: vi.fn(),
}));

vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({
    session: { id: '10000000-0000-4000-8000-000000000001' },
    localParticipant: { participantId: '20000000-0000-4000-8000-000000000002', name: 'Ada', role: 'participant' },
    activityType: 'health_check',
    restoreStatus: 'ready',
    leaveSession: mocks.leaveSession,
    clearLocalSession: mocks.clearLocalSession,
  }),
}));
vi.mock('../../hooks/useSessionPresence', () => ({ useSessionPresence: () => ({}) }));
vi.mock('../../app/sessionServices', () => ({ sessionServices: { health: { getState: mocks.getState, submit: mocks.submit } } }));

import { HealthCheckRespondPage } from '../../pages/HealthCheckRespond';

const BASE_STATE = {
  templateVersion: 'squad-health-v1',
  squadName: 'Plattform',
  measurementDate: '2026-08-26',
  role: 'participant',
  expiresAt: '2026-08-27T09:55:00Z',
};

describe('HealthCheckRespondPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('shows a lobby waiting screen and allows leaving before start', async () => {
    const user = userEvent.setup();
    mocks.getState.mockResolvedValue({ ok: true, value: { ...BASE_STATE, phase: 'lobby', respondentState: null } });
    mocks.leaveSession.mockResolvedValue({ ok: true });
    render(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Venter på Plattform' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Forlat helsesjekken' }));
    expect(mocks.leaveSession).toHaveBeenCalledOnce();
  });

  it('submits all 31 responses in the canonical response flow and locks leave after start', async () => {
    mocks.getState
      .mockResolvedValueOnce({ ok: true, value: { ...BASE_STATE, phase: 'collecting', respondentState: 'in_progress' } })
      .mockResolvedValueOnce({ ok: true, value: { ...BASE_STATE, phase: 'collecting', respondentState: 'completed' } });
    mocks.submit.mockResolvedValue({ ok: true, value: { status: 'completed' } });
    render(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', {
      name: 'Jeg gleder meg som regel til arbeidsdagen.',
    })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Forlat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    for (let index = 0; index < 31; index += 1) {
      fireEvent.input(screen.getByRole('slider'), { target: { value: '4' } });
      fireEvent.click(screen.getByRole('button', { name: index === 30 ? 'Se gjennom svar' : 'Neste' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Send svar' }));

    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
    const responses = mocks.submit.mock.calls[0][1];
    expect(Object.keys(responses)).toHaveLength(31);
    expect(await screen.findByRole('heading', { name: 'Svarene er registrert' })).toBeVisible();
    expect(localStorage.getItem('estimat_health_check_draft:10000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000002')).toBeNull();
  });

  it('stops the response flow when the facilitator aborts the server session', async () => {
    vi.useFakeTimers();
    mocks.getState
      .mockResolvedValueOnce({ ok: true, value: { ...BASE_STATE, phase: 'collecting', respondentState: 'in_progress' } })
      .mockResolvedValueOnce({ ok: false, reason: 'forbidden' });
    render(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);

    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('heading', {
      name: 'Jeg gleder meg som regel til arbeidsdagen.',
    })).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(screen.getByRole('heading', { name: 'Helsesjekken er avsluttet' })).toBeVisible();
    expect(screen.queryByRole('heading', {
      name: 'Jeg gleder meg som regel til arbeidsdagen.',
    })).not.toBeInTheDocument();
    expect(mocks.clearLocalSession).toHaveBeenCalledOnce();
  });
});
