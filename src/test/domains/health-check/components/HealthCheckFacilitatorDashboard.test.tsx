import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HealthCheckFacilitatorDashboard } from '../../../../domains/health-check/components';

const completeRows = [
  { memberId: 'member-1', displayName: 'Ada', status: 'completed', isOnline: true },
  { memberId: 'member-2', displayName: 'Bjørn', status: 'completed', isOnline: false },
  { memberId: 'member-3', displayName: 'Celine', status: 'completed', isOnline: true },
  { memberId: 'member-4', displayName: 'David', status: 'completed', isOnline: true },
  { memberId: 'member-5', displayName: 'Emilie', status: 'completed', isOnline: true },
] as const;

const mixedRows = completeRows.map((row, index) => ({
  ...row,
  status: index < 3 ? 'completed' as const : 'in_progress' as const,
}));

function renderDashboard(
  overrides: Partial<React.ComponentProps<typeof HealthCheckFacilitatorDashboard>> = {},
) {
  const props: React.ComponentProps<typeof HealthCheckFacilitatorDashboard> = {
    squadName: 'Plattform',
    progressRows: mixedRows,
    actionLoading: false,
    error: null,
    onRemoveInProgress: vi.fn(),
    onFinalize: vi.fn(),
    onAbort: vi.fn(),
    ...overrides,
  };

  return { ...render(<HealthCheckFacilitatorDashboard {...props} />), props };
}

describe('HealthCheckFacilitatorDashboard', () => {
  it('viser bare navn, Pågår/Fullført og tillatt samlet fremdrift', () => {
    const { container } = renderDashboard();

    expect(screen.getByRole('heading', { level: 1, name: 'Plattform' })).toBeVisible();
    expect(screen.getByRole('status', { name: 'Samlet fremdrift' })).toHaveTextContent('3 av 5 fullført');
    expect(screen.getAllByText('Fullført')).toHaveLength(3);
    expect(screen.getAllByText('Pågår')).toHaveLength(2);
    expect(container).not.toHaveTextContent(/score|prosent|e-post|spørsmål|svar|tid/i);
  });

  it('bruker en semantisk statusliste og skiller tilstedeværelse fra arbeidsstatus', () => {
    renderDashboard();

    const list = screen.getByRole('list', { name: 'Deltakerstatus' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByLabelText('Ada er online')).toBeVisible();
    expect(screen.getByLabelText('Bjørn er offline')).toBeVisible();
  });

  it('avviser 0 rader og aktiverer fullføring med 1 fullført rad', () => {
    const { rerender, props } = renderDashboard({ progressRows: [] });
    const finalize = () => screen.getByRole('button', { name: 'Fullfør helsesjekk' });

    expect(finalize()).toBeDisabled();
    rerender(<HealthCheckFacilitatorDashboard {...props} progressRows={completeRows.slice(0, 1)} />);
    expect(finalize()).toBeEnabled();
  });

  it('lar ikke online-status påvirke fullføringsgrunnlaget', () => {
    renderDashboard({ progressRows: completeRows.map((row) => ({ ...row, isOnline: false })) });

    expect(screen.getByRole('button', { name: 'Fullfør helsesjekk' })).toBeEnabled();
  });

  it('bruker konfigurert minimum for fullføring', () => {
    renderDashboard({ progressRows: completeRows, minimum: 6 });

    expect(screen.getByRole('button', { name: 'Fullfør helsesjekk' })).toBeDisabled();
    expect(screen.getByText(/minimum 6 deltakere/i)).toBeVisible();
  });

  it('håndhever hard minimumsgrense 1 selv om prop er 0', () => {
    const { rerender, props } = renderDashboard({ progressRows: [], minimum: 0 });

    expect(screen.getByRole('button', { name: 'Fullfør helsesjekk' })).toBeDisabled();
    expect(screen.getByText(/minimum 1 deltaker/i)).toBeVisible();

    rerender(<HealthCheckFacilitatorDashboard {...props} minimum={0} progressRows={completeRows.slice(0, 1)} />);
    expect(screen.getByRole('button', { name: 'Fullfør helsesjekk' })).toBeEnabled();
  });

  it('krever bekreftelse før helsesjekken finaliseres og rapport klargjøres', async () => {
    const user = userEvent.setup();
    const confirmFinalize = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const onFinalize = vi.fn();
    renderDashboard({ progressRows: completeRows, confirmFinalize, onFinalize });

    const finalize = screen.getByRole('button', { name: 'Fullfør helsesjekk' });
    await user.click(finalize);
    expect(onFinalize).not.toHaveBeenCalled();
    await user.click(finalize);
    expect(onFinalize).toHaveBeenCalledOnce();
  });

  it('viser fjerning bare for Pågår og krever bekreftelse', async () => {
    const user = userEvent.setup();
    const confirmRemove = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const onRemoveInProgress = vi.fn();
    renderDashboard({ confirmRemove, onRemoveInProgress });

    expect(screen.queryByRole('button', { name: 'Fjern Ada' })).not.toBeInTheDocument();
    const remove = screen.getByRole('button', { name: 'Fjern David' });
    await user.click(remove);
    expect(confirmRemove).toHaveBeenLastCalledWith(mixedRows[3]);
    expect(onRemoveInProgress).not.toHaveBeenCalled();
    await user.click(remove);
    expect(onRemoveInProgress).toHaveBeenCalledExactlyOnceWith('member-4');
  });

  it('krever bekreftelse før helsesjekken avbrytes', async () => {
    const user = userEvent.setup();
    const confirmAbort = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const onAbort = vi.fn();
    renderDashboard({ confirmAbort, onAbort });

    const abort = screen.getByRole('button', { name: 'Avbryt helsesjekk' });
    await user.click(abort);
    expect(onAbort).not.toHaveBeenCalled();
    await user.click(abort);
    expect(onAbort).toHaveBeenCalledOnce();
  });

  it('viser loading med ellipse, låser mutasjoner og annonserer feil', () => {
    renderDashboard({ actionLoading: true, error: 'Kunne ikke fullføre helsesjekken.' });

    expect(screen.getByRole('button', { name: 'Fullfører…' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /^Fjern / }).every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Avbryt helsesjekk' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Kunne ikke fullføre helsesjekken.');
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    const loadingStatus = document.getElementById('health-dashboard-action-status');
    expect(loadingStatus).toHaveTextContent('Utfører handling…');
    expect(loadingStatus).toHaveAttribute('id', 'health-dashboard-action-status');
    expect(screen.getByRole('main')).not.toContainElement(loadingStatus);
  });

  it('har minst 44 px berøringsmål og synlige fokusstiler', () => {
    renderDashboard();

    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('min-h-11');
      expect(button.className).toContain('focus-visible:ring-2');
    }
  });

  it('rendrer skadelige navn som tekst, aldri som HTML', () => {
    const displayName = '<script>alert(1)</script>';
    const { container } = renderDashboard({
      progressRows: [{ memberId: 'unsafe', displayName, status: 'in_progress' }],
    });

    expect(screen.getByText(displayName)).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
  });

  it('bruker ikke Storage eller console ved fjerning', async () => {
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
    renderDashboard({ confirmRemove: () => true });

    await user.click(screen.getByRole('button', { name: 'Fjern David' }));

    storageSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});
