import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registerSW, updateSW } = vi.hoisted(() => ({
  registerSW: vi.fn(),
  updateSW: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../lib/registerServiceWorker', () => ({ registerSW }));

import { AppUpdateNotice } from '../../components/AppUpdateNotice';

describe('AppUpdateNotice', () => {
  beforeEach(() => {
    registerSW.mockReset();
    updateSW.mockClear();
    registerSW.mockImplementation(({ onNeedRefresh }) => {
      onNeedRefresh();
      return updateSW;
    });
  });

  it('venter på samtykke før den aktiverer en ventende oppdatering', async () => {
    const user = userEvent.setup();
    render(<AppUpdateNotice />);

    expect(await screen.findByRole('status')).toHaveTextContent('En ny versjon av Estimat er klar.');
    expect(updateSW).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Oppdater appen' }));

    expect(updateSW).toHaveBeenCalledTimes(1);
  });
});
