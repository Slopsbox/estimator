import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  submit: vi.fn(),
  leaveSession: vi.fn(),
  clearLocalSession: vi.fn(),
  sessionId: '10000000-0000-4000-8000-000000000001' as string | null,
}));

vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({
    session: mocks.sessionId ? { id: mocks.sessionId } : null,
    localParticipant: mocks.sessionId
      ? { participantId: '20000000-0000-4000-8000-000000000002', name: 'Ada', role: 'participant' }
      : null,
    activityType: mocks.sessionId ? 'health_check' : null,
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
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.sessionId = '10000000-0000-4000-8000-000000000001';
    localStorage.clear();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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
    mocks.getState.mockResolvedValue({ ok: true, value: { ...BASE_STATE, phase: 'collecting', respondentState: 'in_progress' } });
    mocks.submit.mockResolvedValue({ ok: true, value: { status: 'completed' } });
    render(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Arbeidsglede og energi' })).toBeVisible();
    expect(screen.queryByText('Svar som Ada')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start området' }));
    expect(await screen.findByRole('heading', {
      name: 'Jeg gleder meg som regel til arbeidsdagen.',
    })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Forlat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    for (let index = 0; index < 31; index += 1) {
      fireEvent.input(screen.getByRole('slider'), { target: { value: '4' } });
      fireEvent.click(screen.getByRole('button', { name: index === 30 ? 'Send svar' : 'Neste' }));
      const areaStartButton = screen.queryByRole('button', { name: 'Start området' });
      if (areaStartButton) fireEvent.click(areaStartButton);
    }

    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());
    const responses = mocks.submit.mock.calls[0][1];
    expect(Object.keys(responses)).toHaveLength(31);
    expect(await screen.findByRole('heading', { name: 'Svarene dine er registrert.' })).toBeVisible();
    expect(screen.getByRole('img', { name: /Et bål med seks/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Endre|Forrige|pause/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Avslutt' }));
    expect(mocks.clearLocalSession).toHaveBeenCalledOnce();
    expect(mocks.leaveSession).not.toHaveBeenCalled();
    expect(localStorage.getItem('estimat_health_check_draft:10000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000002')).toBeNull();
  });

  it('stops the response flow when the facilitator aborts the server session', async () => {
    vi.useFakeTimers();
    mocks.getState
      .mockResolvedValueOnce({ ok: true, value: { ...BASE_STATE, phase: 'collecting', respondentState: 'in_progress' } })
      .mockResolvedValueOnce({ ok: false, reason: 'forbidden' });
    render(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);

    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'Start området' }));
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

  it('restores the campfire for a completed respondent and updates the receipt after room closure', async () => {
    vi.useFakeTimers();
    mocks.getState
      .mockResolvedValueOnce({ ok: true, value: { ...BASE_STATE, phase: 'collecting', respondentState: 'completed' } })
      .mockResolvedValue({ ok: false, reason: 'forbidden' });
    render(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('heading', { name: 'Svarene dine er registrert.' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Svarene dine er registrert.' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Ta en pause mens resten av squaden gjør seg ferdig');
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(mocks.getState).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: 'Svarene dine er registrert.' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Helsesjekken er avsluttet. Takk for bidraget ditt.');
  });

  it('does not clear a newer room when the completed room closes', async () => {
    vi.useFakeTimers();
    mocks.getState
      .mockResolvedValueOnce({ ok: true, value: { ...BASE_STATE, phase: 'collecting', respondentState: 'completed' } })
      .mockResolvedValueOnce({ ok: false, reason: 'forbidden' });
    const view = render(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('heading', { name: 'Svarene dine er registrert.' })).toBeVisible();

    mocks.sessionId = '10000000-0000-4000-8000-000000000099';
    view.rerender(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(screen.getByRole('status')).toHaveTextContent('Helsesjekken er avsluttet. Takk for bidraget ditt.');
    expect(mocks.clearLocalSession).not.toHaveBeenCalled();
  });

  it('does not clear a newer room when an in-flight completion poll finishes late', async () => {
    vi.useFakeTimers();
    let resolveCompletionPoll: ((value: unknown) => void) | undefined;
    const completionPoll = new Promise((resolve) => { resolveCompletionPoll = resolve; });
    mocks.getState
      .mockResolvedValueOnce({ ok: true, value: { ...BASE_STATE, phase: 'collecting', respondentState: 'completed' } })
      .mockReturnValueOnce(completionPoll);
    const view = render(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    mocks.sessionId = '10000000-0000-4000-8000-000000000099';
    view.rerender(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);
    await act(async () => {
      resolveCompletionPoll?.({ ok: false, reason: 'forbidden' });
      await completionPoll;
    });

    expect(screen.getByRole('status')).toHaveTextContent('Helsesjekken er avsluttet. Takk for bidraget ditt.');
    expect(mocks.clearLocalSession).not.toHaveBeenCalled();
  });

  it('ignores an old state response after switching rooms', async () => {
    let resolveOldRoom: ((value: unknown) => void) | undefined;
    const oldRoomRequest = new Promise((resolve) => { resolveOldRoom = resolve; });
    mocks.getState
      .mockReturnValueOnce(oldRoomRequest)
      .mockResolvedValueOnce({
        ok: true,
        value: { ...BASE_STATE, squadName: 'Nytt rom', phase: 'lobby', respondentState: null },
      });
    const view = render(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);
    await waitFor(() => expect(mocks.getState).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001'));

    mocks.sessionId = '10000000-0000-4000-8000-000000000099';
    view.rerender(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Venter på Nytt rom' })).toBeVisible();

    await act(async () => {
      resolveOldRoom?.({
        ok: true,
        value: { ...BASE_STATE, squadName: 'Gammelt rom', phase: 'collecting', respondentState: 'completed' },
      });
      await oldRoomRequest;
    });
    expect(screen.getByRole('heading', { name: 'Venter på Nytt rom' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Svarene dine er registrert.' })).not.toBeInTheDocument();
  });

  it('invalidates an old state response while switching through no active room', async () => {
    let resolveOldRoom: ((value: unknown) => void) | undefined;
    const oldRoomRequest = new Promise((resolve) => { resolveOldRoom = resolve; });
    mocks.getState
      .mockReturnValueOnce(oldRoomRequest)
      .mockResolvedValueOnce({
        ok: true,
        value: { ...BASE_STATE, squadName: 'Nytt rom', phase: 'lobby', respondentState: null },
      });
    const view = render(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);
    await waitFor(() => expect(mocks.getState).toHaveBeenCalledOnce());

    mocks.sessionId = null;
    view.rerender(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);
    mocks.sessionId = '10000000-0000-4000-8000-000000000099';
    view.rerender(<MemoryRouter><HealthCheckRespondPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Venter på Nytt rom' })).toBeVisible();

    await act(async () => {
      resolveOldRoom?.({ ok: false, reason: 'forbidden' });
      await oldRoomRequest;
    });
    expect(screen.getByRole('heading', { name: 'Venter på Nytt rom' })).toBeVisible();
    expect(mocks.clearLocalSession).not.toHaveBeenCalled();
  });
});
