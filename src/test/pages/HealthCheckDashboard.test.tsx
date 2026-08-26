import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SQUAD_HEALTH_TEMPLATE_V1 } from '../../domains/health-check/domain';

const mocks = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  localParticipant: null as null | Record<string, unknown>,
  activityType: null as null | 'health_check',
  createHealthCheck: vi.fn(),
  clearLocalSession: vi.fn(),
  getState: vi.fn(),
  start: vi.fn(),
  getProgress: vi.fn(),
  removeRespondent: vi.fn(),
  abort: vi.fn(),
  finalizePrototype: vi.fn(),
  participants: [] as Record<string, unknown>[],
  refetchParticipants: vi.fn(),
}));

vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({
    session: mocks.session,
    localParticipant: mocks.localParticipant,
    activityType: mocks.activityType,
    restoreStatus: 'ready',
    error: null,
    createHealthCheck: mocks.createHealthCheck,
    clearLocalSession: mocks.clearLocalSession,
  }),
}));
vi.mock('../../hooks/useRealtimeParticipants', () => ({
  useRealtimeParticipants: () => ({
    participants: mocks.participants,
    loading: false,
    error: null,
    refetch: mocks.refetchParticipants,
  }),
}));
vi.mock('../../hooks/useSessionPresence', () => ({
  useSessionPresence: () => ({ presentParticipantIds: new Set(['participant-1']), presenceReady: true }),
}));
vi.mock('../../app/sessionServices', () => ({
  sessionServices: { health: {
    getState: mocks.getState,
    start: mocks.start,
    getProgress: mocks.getProgress,
    removeRespondent: mocks.removeRespondent,
    abort: mocks.abort,
    finalizePrototype: mocks.finalizePrototype,
  } },
}));

import { HealthCheckDashboardPage } from '../../pages/HealthCheckDashboard';

const SESSION = {
  id: '10000000-0000-4000-8000-000000000001',
  join_code: 'ABCD',
  activity_type: 'health_check',
};
const FACILITATOR = {
  participantId: '20000000-0000-4000-8000-000000000002',
  role: 'facilitator',
};
const LOBBY_STATE = {
  phase: 'lobby',
  templateVersion: 'squad-health-v1',
  squadName: 'Plattform',
  measurementDate: '2026-08-26',
  respondentState: null,
  role: 'facilitator',
};
const COLLECTING_STATE = { ...LOBBY_STATE, phase: 'collecting' };

function resultFixture() {
  return {
    status: 'completed',
    reportSchemaVersion: 'health-check-prototype-v1',
    squadName: 'Plattform',
    measurementDate: '2026-08-26',
    templateVersion: 'squad-health-v1',
    responseCount: 1,
    areas: SQUAD_HEALTH_TEMPLATE_V1.areas.map((area, areaIndex) => ({
      areaKey: area.key,
      sequence: areaIndex + 1,
      title: area.title,
      average: 5.2,
      questions: area.questions.map((question) => ({
        questionKey: question.key,
        sequence: question.sequence,
        text: question.text,
        average: 5.2,
      })),
    })),
  };
}

describe('HealthCheckDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = null;
    mocks.localParticipant = null;
    mocks.activityType = null;
    mocks.participants = [];
  });

  it('creates a real health check from name, squad and date', async () => {
    const user = userEvent.setup();
    mocks.createHealthCheck.mockResolvedValue(SESSION);
    render(<MemoryRouter><HealthCheckDashboardPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('Ditt navn'), 'Ola');
    await user.type(screen.getByLabelText('Squad'), 'Plattform');
    fireEvent.change(screen.getByLabelText('Måledato'), { target: { value: '2026-08-26' } });
    await user.click(screen.getByRole('button', { name: 'Opprett helsesjekk' }));

    expect(mocks.createHealthCheck).toHaveBeenCalledWith('Ola', 'Plattform', '2026-08-26');
  });

  it('shows live lobby members and starts through the health service', async () => {
    const user = userEvent.setup();
    mocks.session = SESSION;
    mocks.localParticipant = FACILITATOR;
    mocks.activityType = 'health_check';
    mocks.participants = [{ id: 'participant-1', name: 'Ada', role: 'participant' }];
    mocks.getState.mockResolvedValueOnce({ ok: true, value: LOBBY_STATE })
      .mockResolvedValueOnce({ ok: true, value: COLLECTING_STATE });
    mocks.start.mockResolvedValue({ ok: true, value: { status: 'ok', phase: 'collecting' } });
    mocks.getProgress.mockResolvedValue({ ok: true, value: [{ memberId: 'participant-1', displayName: 'Ada', status: 'in_progress' }] });
    render(<MemoryRouter><HealthCheckDashboardPage /></MemoryRouter>);

    expect(await screen.findByText('Ada')).toBeVisible();
    expect(screen.getByLabelText('Ada er online')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Start helsesjekk' }));

    expect(mocks.start).toHaveBeenCalledWith(SESSION.id);
    expect(await screen.findByRole('heading', { name: 'Deltakerstatus' })).toBeVisible();
  });

  it('polls real progress and performs terminal finalize only once', async () => {
    const user = userEvent.setup();
    mocks.session = SESSION;
    mocks.localParticipant = FACILITATOR;
    mocks.activityType = 'health_check';
    mocks.getState.mockResolvedValue({ ok: true, value: COLLECTING_STATE });
    mocks.getProgress.mockResolvedValue({ ok: true, value: [{ memberId: 'participant-1', displayName: 'Ada', status: 'completed' }] });
    mocks.finalizePrototype.mockResolvedValue({ ok: true, value: resultFixture() });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><HealthCheckDashboardPage /></MemoryRouter>);

    const finalize = await screen.findByRole('button', { name: 'Fullfør helsesjekk' });
    await waitFor(() => expect(finalize).toBeEnabled());
    await user.dblClick(finalize);

    expect(mocks.finalizePrototype).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: 'Resultat for Plattform' })).toBeVisible();
    expect(screen.getAllByRole('row')).toHaveLength(8);
    expect(mocks.clearLocalSession).toHaveBeenCalledOnce();
  });

  it('does not automatically retry a failed terminal request and permits manual retry', async () => {
    mocks.session = SESSION;
    mocks.localParticipant = FACILITATOR;
    mocks.activityType = 'health_check';
    mocks.getState.mockResolvedValue({ ok: true, value: COLLECTING_STATE });
    mocks.getProgress.mockResolvedValue({ ok: true, value: [{ memberId: 'participant-1', displayName: 'Ada', status: 'completed' }] });
    mocks.finalizePrototype.mockResolvedValue({ ok: false, reason: 'rpc' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><HealthCheckDashboardPage /></MemoryRouter>);
    const finalize = await screen.findByRole('button', { name: 'Fullfør helsesjekk' });
    await waitFor(() => expect(finalize).toBeEnabled());

    fireEvent.click(finalize);
    expect(await screen.findByRole('alert')).toHaveTextContent('Kontroller tilkoblingen før du prøver igjen');
    expect(screen.getByRole('button', { name: 'Fullfør helsesjekk' })).toBeEnabled();

    expect(mocks.finalizePrototype).toHaveBeenCalledTimes(1);
  });
});
