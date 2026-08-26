import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HealthCheckLobby } from '../../../../domains/health-check/components';

const members = [
  { memberId: 'member-1', displayName: 'Ada', isOnline: true },
  { memberId: 'member-2', displayName: 'Bjørn', isOnline: true },
  { memberId: 'member-3', displayName: 'Celine', isOnline: false },
  { memberId: 'member-4', displayName: 'David', isOnline: true },
  { memberId: 'member-5', displayName: 'Emilie', isOnline: true },
] as const;

function renderLobby(
  overrides: Partial<React.ComponentProps<typeof HealthCheckLobby>> = {},
) {
  const props: React.ComponentProps<typeof HealthCheckLobby> = {
    squadName: 'Plattform',
    measurementDateLabel: '26. august 2026',
    joinCode: '4821',
    codeCopied: false,
    members,
    actionLoading: false,
    error: null,
    onCopyCode: vi.fn(),
    onStart: vi.fn(),
    onRemoveMember: vi.fn(),
    onAbort: vi.fn(),
    ...overrides,
  };

  return { ...render(<HealthCheckLobby {...props} />), props };
}

describe('HealthCheckLobby', () => {
  it('viser squad, måledato, kode og eksplisitt attribusjonsrisiko', () => {
    renderLobby();

    expect(screen.getByRole('heading', { level: 1, name: 'Plattform' })).toBeVisible();
    expect(screen.getByText('26. august 2026')).toBeVisible();
    expect(screen.getByText('4821')).toBeVisible();
    expect(screen.getByText(/resultatet er et gruppeaggregat/i)).toBeVisible();
    expect(screen.getByText(/med én deltaker.*ikke anonymt/i)).toBeVisible();
    expect(screen.getByText(/små grupper.*tilskrives enkeltpersoner/i)).toBeVisible();
    expect(screen.getByText(/minimum 1 deltaker/i)).toBeVisible();
  });

  it('deaktiverer start med 0 medlemmer og aktiverer med 1', () => {
    const { rerender, props } = renderLobby({ members: [] });

    expect(screen.getByRole('button', { name: 'Start helsesjekk' })).toBeDisabled();

    rerender(<HealthCheckLobby {...props} members={members.slice(0, 1)} />);
    expect(screen.getByRole('button', { name: 'Start helsesjekk' })).toBeEnabled();
  });

  it('teller offline-medlemmer i minimumsgrunnlaget', () => {
    renderLobby({ members: members.map((member) => ({ ...member, isOnline: false })) });

    expect(screen.getByRole('button', { name: 'Start helsesjekk' })).toBeEnabled();
  });

  it('viser navn og tilgjengelig online/offline-status i en semantisk liste', () => {
    renderLobby();

    const list = screen.getByRole('list', { name: 'Deltakere' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByLabelText('Ada er online')).toBeVisible();
    expect(screen.getByLabelText('Celine er offline')).toBeVisible();
    expect(screen.getByText('Celine')).toBeVisible();
  });

  it('kaller kopiering og lar parent styre feedback-etiketten', async () => {
    const user = userEvent.setup();
    const onCopyCode = vi.fn();
    const { rerender, props } = renderLobby({ onCopyCode, codeCopied: false });

    await user.click(screen.getByRole('button', { name: 'Kopier deltakerkode' }));
    expect(onCopyCode).toHaveBeenCalledOnce();
    expect(screen.getByText('Trykk for å kopiere')).toBeVisible();

    rerender(<HealthCheckLobby {...props} codeCopied />);
    expect(screen.getByText('Kopiert!')).toBeVisible();
  });

  it('fjerner ikke medlem når bekreftelsen avslås, og fjerner ved godkjenning', async () => {
    const user = userEvent.setup();
    const confirmRemove = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const onRemoveMember = vi.fn();
    renderLobby({ confirmRemove, onRemoveMember });

    const remove = screen.getByRole('button', { name: 'Fjern Ada' });
    await user.click(remove);
    expect(confirmRemove).toHaveBeenLastCalledWith(members[0]);
    expect(onRemoveMember).not.toHaveBeenCalled();

    await user.click(remove);
    expect(onRemoveMember).toHaveBeenCalledExactlyOnceWith('member-1');
  });

  it('avbryter ikke når bekreftelsen avslås, og avbryter ved godkjenning', async () => {
    const user = userEvent.setup();
    const confirmAbort = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const onAbort = vi.fn();
    renderLobby({ confirmAbort, onAbort });

    const abort = screen.getByRole('button', { name: 'Avbryt helsesjekk' });
    await user.click(abort);
    expect(onAbort).not.toHaveBeenCalled();
    await user.click(abort);
    expect(onAbort).toHaveBeenCalledOnce();
  });

  it('deaktiverer mutasjoner, viser ellipsetekst og annonserer feil under lasting', () => {
    renderLobby({ actionLoading: true, error: 'Kunne ikke starte helsesjekken.' });

    expect(screen.getByRole('button', { name: 'Starter…' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /^Fjern / }).every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Avbryt helsesjekk' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Kunne ikke starte helsesjekken.');
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    const loadingStatus = document.getElementById('health-lobby-action-status');
    expect(loadingStatus).toHaveTextContent('Utfører handling…');
    expect(loadingStatus).toHaveAttribute('id', 'health-lobby-action-status');
    expect(screen.getByRole('main')).not.toContainElement(loadingStatus);
  });

  it('bruker konfigurert minimum, semantiske mål og synlige fokusstiler', () => {
    renderLobby({ minimumRespondents: 6 });

    expect(screen.getByText(/minimum 6 deltakere/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start helsesjekk' })).toBeDisabled();
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('min-h-11');
      expect(button.className).toContain('focus-visible:ring-2');
    }
  });

  it('håndhever hard minimumsgrense 1 selv om prop er 0', () => {
    const { rerender, props } = renderLobby({ minimumRespondents: 0, members: [] });

    expect(screen.getByRole('button', { name: 'Start helsesjekk' })).toBeDisabled();
    expect(screen.getByText(/minimum 1 deltaker/i)).toBeVisible();

    rerender(<HealthCheckLobby {...props} minimumRespondents={0} members={members.slice(0, 1)} />);
    expect(screen.getByRole('button', { name: 'Start helsesjekk' })).toBeEnabled();
  });

  it('rendrer skadelig medlemsnavn som tekst og eksponerer ingen helsedetaljer', () => {
    const displayName = '<img src=x onerror=alert(1)>';
    const { container } = renderLobby({
      members: [{ memberId: 'unsafe', displayName, isOnline: true }],
    });

    expect(screen.getByText(displayName)).toBeVisible();
    expect(container.querySelector('img')).toBeNull();
    expect(container).not.toHaveTextContent(/score|prosent|e-post|spørsmål/i);
  });

  it('bruker ikke Storage eller console ved interaksjon', async () => {
    const user = userEvent.setup();
    const storageSpies = [
      vi.spyOn(Storage.prototype, 'getItem'),
      vi.spyOn(Storage.prototype, 'setItem'),
      vi.spyOn(Storage.prototype, 'removeItem'),
    ];
    const consoleSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ];
    renderLobby({ confirmRemove: () => true });

    await user.click(screen.getByRole('button', { name: 'Kopier deltakerkode' }));
    await user.click(screen.getByRole('button', { name: 'Fjern Ada' }));

    storageSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});
