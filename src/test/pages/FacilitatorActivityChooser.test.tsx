import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { FacilitatorActivityChooserPage } from '../../pages/FacilitatorActivityChooser';

const { navigate, sessionState } = vi.hoisted(() => ({
  navigate: vi.fn(),
  sessionState: {
    session: null as Record<string, unknown> | null,
    activityType: null as 'estimation' | 'health_check' | null,
    localParticipant: null as Record<string, unknown> | null,
  },
}));
vi.mock('../../hooks/useSession', () => ({
  useSession: () => sessionState,
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useNavigate: () => navigate,
}));

describe('FacilitatorActivityChooserPage', () => {
  it('tilbyr begge aktivitetene og navigerer til kanoniske dashboards', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><FacilitatorActivityChooserPage /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Velg aktivitet' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Estimering/ }));
    expect(navigate).toHaveBeenLastCalledWith('/estimation/dashboard');
    await user.click(screen.getByRole('button', { name: /Helsesjekk/ }));
    expect(navigate).toHaveBeenLastCalledWith('/health-check/dashboard');
  });

  it('beholder aktivitetsvelgeren åpen når en annen aktivitet er aktiv', () => {
    navigate.mockClear();
    sessionState.session = { id: 'health-room' };
    sessionState.activityType = 'health_check';
    sessionState.localParticipant = { role: 'facilitator' };

    render(<MemoryRouter><FacilitatorActivityChooserPage /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Velg aktivitet' })).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
    sessionState.session = null;
    sessionState.activityType = null;
    sessionState.localParticipant = null;
  });

  it('viser aktivitetsvalget uten å vente på verifisering', () => {
    render(<MemoryRouter><FacilitatorActivityChooserPage /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /Estimering/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Helsesjekk/ })).toBeEnabled();
  });
});
