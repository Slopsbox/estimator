import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthCheckPreviewPage } from '../../pages/HealthCheckPreview';

function renderPage() {
  return render(
    <MemoryRouter>
      <HealthCheckPreviewPage />
    </MemoryRouter>,
  );
}

describe('HealthCheckPreviewPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('viser tydelig demo-banner, hjemlenke og tilgjengelige visningsknapper', () => {
    renderPage();

    expect(screen.getByText('Forhåndsvisning – bruker ingen ekte data')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Til forsiden' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Deltaker' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Fasilitator' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('viser den ekte deltakerflyten med lokalt demonnavn', () => {
    renderPage();

    expect(screen.getByText('Svarer som: Demo-deltaker')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Jeg gleder meg som regel til arbeidsdagen.' })).toBeVisible();
    expect(screen.getByText('Spørsmål 1 av 31')).toBeVisible();
  });

  it('simulerer innsending kort og viser lokal ferdigbekreftelse', () => {
    vi.useFakeTimers();
    renderPage();
    fireEvent.click(screen.getByRole('switch', { name: 'Gå automatisk til neste spørsmål' }));

    for (let index = 0; index < 31; index += 1) {
      fireEvent.input(screen.getByRole('slider'), { target: { value: '4' } });
      fireEvent.click(screen.getByRole('button', { name: index === 30 ? 'Se gjennom svar' : 'Neste' }));
    }

    fireEvent.click(screen.getByRole('button', { name: 'Send svar' }));
    expect(screen.getByRole('button', { name: 'Sender svar…' })).toBeDisabled();

    act(() => vi.advanceTimersByTime(450));
    expect(screen.getByRole('heading', { name: 'Demo-svarene er registrert lokalt' })).toHaveFocus();
    expect(screen.getByText('Ingen svar ble sendt eller lagret.')).toBeVisible();
  });

  it('driver fasilitator-demoen fra fem av seks fullført til klar rapport', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Fasilitator' }));
    expect(screen.getByRole('button', { name: 'Fasilitator' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status', { name: 'Samlet fremdrift' })).toHaveTextContent('5 av 6 fullført');
    expect(screen.getByRole('button', { name: 'Fjern Frida' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Fullfør helsesjekk' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Merk alle som fullført' }));
    expect(screen.getByRole('status', { name: 'Samlet fremdrift' })).toHaveTextContent('6 av 6 fullført');
    expect(screen.getByRole('button', { name: 'Fullfør helsesjekk' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Fullfør helsesjekk' }));
    expect(screen.getByRole('status', { name: 'Rapportstatus' })).toHaveTextContent('Rapport klargjøres…');

    await user.click(screen.getByRole('button', { name: 'Gjør rapport klar' }));
    expect(screen.getByRole('status', { name: 'Rapportstatus' })).toHaveTextContent('Rapport klar for nedlasting');
    expect(screen.getByRole('status', { name: 'Demo-handling' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Last ned resultat' }));
    expect(screen.getByRole('status', { name: 'Demo-handling' })).toHaveTextContent(
      'Demo: Nedlasting er simulert. Ingen fil ble opprettet.',
    );
  });

  it('bruker aldri nettverk eller nettleserlagring', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const storageSpies = [
      vi.spyOn(Storage.prototype, 'getItem'),
      vi.spyOn(Storage.prototype, 'setItem'),
      vi.spyOn(Storage.prototype, 'removeItem'),
      vi.spyOn(Storage.prototype, 'clear'),
    ];
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Fasilitator' }));
    await user.click(screen.getByRole('button', { name: 'Merk alle som fullført' }));
    await user.click(screen.getByRole('button', { name: 'Fullfør helsesjekk' }));
    await user.click(screen.getByRole('button', { name: 'Gjør rapport klar' }));
    await user.click(screen.getByRole('button', { name: 'Last ned resultat' }));
    await user.click(screen.getByRole('button', { name: 'Deltaker' }));
    act(() => screen.getByRole('slider').dispatchEvent(new Event('input', { bubbles: true })));

    expect(fetchSpy).not.toHaveBeenCalled();
    storageSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});
