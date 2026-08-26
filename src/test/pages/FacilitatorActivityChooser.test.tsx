import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { FacilitatorActivityChooserPage } from '../../pages/FacilitatorActivityChooser';

const navigate = vi.fn();
vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({ session: null, activityType: null, localParticipant: null }),
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
});
