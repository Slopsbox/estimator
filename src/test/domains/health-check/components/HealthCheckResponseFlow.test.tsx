import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthCheckResponseFlow } from '../../../../domains/health-check/components';
import {
  SQUAD_HEALTH_TEMPLATE_V1,
  flattenHealthCheckQuestions,
  type HealthCheckResponseMap,
} from '../../../../domains/health-check/domain';

describe('HealthCheckResponseFlow', () => {
  beforeEach(() => sessionStorage.clear());

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function renderFlow(overrides: Partial<React.ComponentProps<typeof HealthCheckResponseFlow>> = {}) {
    const props: React.ComponentProps<typeof HealthCheckResponseFlow> = {
      submitting: false,
      submitError: null,
      onSubmit: vi.fn(),
      ...overrides,
    };
    return { ...render(<HealthCheckResponseFlow {...props} />), props };
  }

  function answerAll(scoreForIndex: (index: number) => number = () => 4) {
    const questions = flattenHealthCheckQuestions(SQUAD_HEALTH_TEMPLATE_V1);

    for (let index = 0; index < questions.length; index += 1) {
      fireEvent.input(screen.getByRole('slider'), {
        target: { value: String(scoreForIndex(index)) },
      });
      fireEvent.click(screen.getByRole('button', { name: index === 30 ? 'Se gjennom svar' : 'Neste' }));
    }
  }

  it('viser åpen spørsmålskomposisjon, identitet og syv områdesegmenter uten spørsmålstall', () => {
    renderFlow({ participantName: 'Kato' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Jeg gleder meg som regel til arbeidsdagen.',
    );
    expect(screen.getByText('Arbeidsglede og energi')).toBeVisible();
    expect(screen.getByText('Er det fortsatt gøy å gå på jobb?')).toBeVisible();
    expect(screen.queryByText(/Spørsmål \d+ av \d+/)).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText(/Velg hvor enig/)).not.toBeInTheDocument();

    const progress = screen.getByRole('progressbar', {
      name: 'Fremdrift gjennom helsesjekken',
    });
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress).toHaveAttribute('aria-valuemax', '31');
    expect(progress).toHaveAttribute(
      'aria-valuetext',
      'Spørsmål 1 av 31, Arbeidsglede og energi',
    );
    expect(progress.querySelectorAll('[data-area-progress-segment]')).toHaveLength(7);
    expect(progress.querySelector('[data-state="current"] > span')).toHaveStyle({
      transform: 'scaleX(0.25)',
    });
    expect(screen.getByRole('group', { name: 'Svar som Kato' })).toBeVisible();
    expect(screen.getByText('Kato')).toBeVisible();
  });

  it('går bare videre manuelt, annonserer overgangen og fokuserer nytt spørsmål', () => {
    vi.useFakeTimers();
    renderFlow();
    fireEvent.input(screen.getByRole('slider'), { target: { value: '4' } });
    vi.advanceTimersByTime(5000);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Jeg gleder meg som regel til arbeidsdagen.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Neste' }));
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Oppgavene mine gir meg mer energi enn de tapper meg for.');
    expect(screen.getByText('Går til neste spørsmål')).toBeInTheDocument();
    expect(heading).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Forrige' })).toBeVisible();
    vi.useRealTimers();
  });

  it('oppdaterer områdeprogresjonen når neste område nås', () => {
    renderFlow();

    for (let index = 0; index < 4; index += 1) {
      fireEvent.input(screen.getByRole('slider'), { target: { value: '4' } });
      fireEvent.click(screen.getByRole('button', { name: 'Neste' }));
    }

    const progress = screen.getByRole('progressbar', {
      name: 'Fremdrift gjennom helsesjekken',
    });
    const segments = progress.querySelectorAll('[data-area-progress-segment]');
    expect(progress).toHaveAttribute('aria-valuenow', '5');
    expect(progress).toHaveAttribute(
      'aria-valuetext',
      'Spørsmål 5 av 31, Menneskene og tryggheten',
    );
    expect(segments[0]).toHaveAttribute('data-state', 'completed');
    expect(segments[1]).toHaveAttribute('data-state', 'current');
    expect(segments[2]).toHaveAttribute('data-state', 'future');
  });

  it('viser alle 31 svar gruppert i syv områder uten numeriske scoreverdier', () => {
    renderFlow();
    answerAll((index) => (index % 7) + 1);

    expect(screen.getByRole('heading', { name: 'Se gjennom svarene dine' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Se gjennom svarene dine' })).toHaveFocus();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(7);
    expect(screen.getAllByRole('button', { name: /^Endre / })).toHaveLength(31);
    expect(screen.getAllByText('Svært uenig').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Svært enig').length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Score /)).not.toBeInTheDocument();
  });

  it('redigerer valgt spørsmål og returnerer til review med oppdatert etikett', () => {
    renderFlow();
    answerAll();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Endre Jeg gleder meg som regel til arbeidsdagen.',
      }),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Jeg gleder meg som regel til arbeidsdagen.',
    );
    fireEvent.input(screen.getByRole('slider'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tilbake til gjennomgang' }));

    const firstAnswer = screen
      .getByText('Jeg gleder meg som regel til arbeidsdagen.')
      .closest('li');
    expect(firstAnswer).not.toBeNull();
    expect(within(firstAnswer as HTMLElement).getByText('Svært enig')).toBeVisible();
  });

  it('sender en komplett, typet map i malrekkefølge', () => {
    const onSubmit = vi.fn<(responses: HealthCheckResponseMap) => void>();
    renderFlow({ onSubmit });
    answerAll((index) => (index % 7) + 1);

    fireEvent.click(screen.getByRole('button', { name: 'Send svar' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0];
    const expectedKeys = flattenHealthCheckQuestions(SQUAD_HEALTH_TEMPLATE_V1).map(
      (question) => question.key,
    );
    expect(Object.keys(submitted)).toEqual(expectedKeys);
    expect(Object.values(submitted)).toHaveLength(31);
    expect(submitted.joy_look_forward).toBe(1);
    expect(submitted.learning_use_insight).toBe(3);
  });

  it('deaktiverer innsending og viser feil styrt av parent', () => {
    const { rerender } = renderFlow({ submitting: false, submitError: 'Kunne ikke sende svarene.' });
    answerAll();

    rerender(
      <HealthCheckResponseFlow
        submitting
        submitError="Kunne ikke sende svarene."
        onSubmit={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Sender svar…' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /^Endre / }).every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByRole('alert')).toHaveTextContent('Kunne ikke sende svarene.');
    expect(screen.queryByRole('button', { name: 'Forlat' })).not.toBeInTheDocument();
  });

  it('gjenoppretter svar og posisjon etter reload for samme deltaker og rom', () => {
    const { unmount } = renderFlow({ draftKey: 'room-1:participant-1' });

    fireEvent.input(screen.getByRole('slider'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Neste' }));
    unmount();

    renderFlow({ draftKey: 'room-1:participant-1' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Oppgavene mine gir meg mer energi enn de tapper meg for.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Forrige' }));
    expect(screen.getByRole('slider')).toHaveValue('5');
  });

  it('bruker ikke console når et utkast lagres', () => {
    const consoleSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ];
    renderFlow({ draftKey: 'room-1:participant-1' });

    fireEvent.input(screen.getByRole('slider'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Neste' }));

    consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('rendrer potensielt skadelig participantName som tekst, aldri HTML', () => {
    const participantName = '<img src=x onerror=alert(1)>';
    const { container } = renderFlow({ participantName });

    expect(screen.getByText(participantName)).toBeVisible();
    expect(container.querySelector('img')).toBeNull();
  });

  it('videresender valgfri forlat-handling uten navigasjonsantakelser', () => {
    const onLeave = vi.fn();
    renderFlow({ onLeave });

    fireEvent.click(screen.getByRole('button', { name: 'Forlat' }));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('bekrefter før et påbegynt utkast forlates', () => {
    const onLeave = vi.fn();
    const confirmDiscard = vi.fn().mockReturnValue(false);
    renderFlow({ onLeave, confirmDiscard });
    fireEvent.input(screen.getByRole('slider'), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Forlat' }));

    expect(confirmDiscard).toHaveBeenCalledOnce();
    expect(onLeave).not.toHaveBeenCalled();
    confirmDiscard.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Forlat' }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('varsler parent om usendte endringer for fremtidig route guard', () => {
    const onUnsavedChangesChange = vi.fn();
    const { unmount } = renderFlow({ onUnsavedChangesChange });
    expect(onUnsavedChangesChange).toHaveBeenLastCalledWith(false);

    fireEvent.input(screen.getByRole('slider'), { target: { value: '5' } });
    expect(onUnsavedChangesChange).toHaveBeenLastCalledWith(true);

    unmount();
    expect(onUnsavedChangesChange).toHaveBeenLastCalledWith(false);
  });

  it('registrerer beforeunload bare mens et usendt utkast finnes', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderFlow();
    expect(addEventListener).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));

    fireEvent.input(screen.getByRole('slider'), { target: { value: '5' } });
    expect(addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    const handler = addEventListener.mock.calls.find(([event]) => event === 'beforeunload')?.[1];
    const beforeUnloadEvent = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    if (typeof handler === 'function') handler(beforeUnloadEvent);
    expect(beforeUnloadEvent.defaultPrevented).toBe(true);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });
});
