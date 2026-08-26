import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthCheckPreviewPage } from '../../pages/HealthCheckPreview';

const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsText(blob);
  });
}

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
    if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
    else delete (URL as Partial<typeof URL>).createObjectURL;
    if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
    else delete (URL as Partial<typeof URL>).revokeObjectURL;
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
    expect(screen.queryByRole('heading', { name: 'Prototype-resultat' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Gjør rapport klar' }));
    expect(screen.getByRole('status', { name: 'Rapportstatus' })).toHaveTextContent('Rapport klar for nedlasting');
    expect(screen.getByRole('status', { name: 'Demo-handling' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Prototype-resultat' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Områderesultater' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Rullbar tabell med områderesultater' })).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('row')).toHaveLength(8);
    expect(screen.getByRole('list', { name: 'Viktig om demoresultatet' })).toHaveTextContent(
      'Resultatet bruker kun syntetiske demodata',
    );
    expect(screen.getByRole('list', { name: 'Viktig om demoresultatet' })).toHaveTextContent(
      /med én deltaker.*ikke anonymt.*små grupper.*tilskrives enkeltpersoner/i,
    );
    expect(screen.getByRole('row', { name: /Arbeidsglede og energi 5,8\/7 6/ })).toBeVisible();
  });

  it('laster ned lokal CSV med fast filnavn og tilbakekaller objekt-URL utsatt', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:squad-health-demo');
    const revokeObjectURL = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    });
    const realCreateElement = document.createElement.bind(document);
    const anchor = realCreateElement('a');
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => undefined);
    const remove = vi.spyOn(anchor, 'remove');
    const createElement = vi.spyOn(document, 'createElement');
    createElement.mockImplementation(((tagName: string, options?: ElementCreationOptions) => (
      tagName.toLowerCase() === 'a'
        ? anchor
        : realCreateElement(tagName, options)
    )) as typeof document.createElement);
    let scheduledCleanup: (() => void) | undefined;

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Fasilitator' }));
    await user.click(screen.getByRole('button', { name: 'Merk alle som fullført' }));
    await user.click(screen.getByRole('button', { name: 'Fullfør helsesjekk' }));
    await user.click(screen.getByRole('button', { name: 'Gjør rapport klar' }));
    vi.spyOn(window, 'setTimeout').mockImplementation(((callback: TimerHandler) => {
      scheduledCleanup = callback as () => void;
      return 1;
    }) as typeof window.setTimeout);
    fireEvent.click(screen.getByRole('button', { name: 'Last ned resultat' }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(await readBlob(blob)).toContain('SYNTETISKE DEMODATA;2026-08-15');
    expect(anchor.download).toBe('squad-health-demo-resultat.csv');
    expect(anchor.href).toBe('blob:squad-health-demo');
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: 'Demo-handling' })).toHaveTextContent(
      'Demo: CSV-filen er lastet ned lokalt.',
    );

    act(() => scheduledCleanup?.());
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:squad-health-demo');
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
