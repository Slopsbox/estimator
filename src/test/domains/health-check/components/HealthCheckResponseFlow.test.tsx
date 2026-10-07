import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthCheckResponseFlow } from '../../../../domains/health-check/components';
import {
  SQUAD_HEALTH_TEMPLATE_V1,
  flattenHealthCheckQuestions,
  type HealthCheckResponseMap,
} from '../../../../domains/health-check/domain';

describe('HealthCheckResponseFlow', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function renderFlow(overrides: Partial<React.ComponentProps<typeof HealthCheckResponseFlow>> = {}, startArea = true) {
    const props: React.ComponentProps<typeof HealthCheckResponseFlow> = {
      submitting: false,
      submitError: null,
      onSubmit: vi.fn(),
      ...overrides,
    };
    const rendered = render(<HealthCheckResponseFlow {...props} />);
    if (startArea) fireEvent.click(screen.getByRole('button', { name: 'Start området' }));
    return { ...rendered, props };
  }

  async function answerAll(scoreForIndex: (index: number) => number = () => 4, startIndex = 0) {
    const questions = flattenHealthCheckQuestions(SQUAD_HEALTH_TEMPLATE_V1);

    for (let index = startIndex; index < questions.length; index += 1) {
      expect(screen.queryByRole('button', { name: 'Forrige' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Se gjennom svar|Tilbake til gjennomgang|^Endre / })).not.toBeInTheDocument();
      fireEvent.input(screen.getByRole('slider'), {
        target: { value: String(scoreForIndex(index)) },
      });
      if (index === questions.length - 1) {
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Send svar' }));
        });
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Neste' }));
      }
      const areaStartButton = screen.queryByRole('button', { name: 'Start området' });
      if (areaStartButton) fireEvent.click(areaStartButton);
    }
  }

  it('viser tydelig kapittelintro uten deltageridentitet', () => {
    renderFlow({}, false);

    expect(screen.getByRole('heading', { name: 'Arbeidsglede og energi' })).toBeVisible();
    expect(screen.getByText('Arbeidsglede og energi')).toBeVisible();
    expect(screen.getByText('Er det fortsatt gøy å gå på jobb?')).toBeVisible();
    expect(screen.queryByText('Svar som Kato')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start området' })).toBeVisible();

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
    expect(screen.queryByRole('button', { name: 'Forrige' })).not.toBeInTheDocument();
    expect(screen.queryByText('Når du trykker «Neste», kan svaret ikke endres.')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('oppdaterer områdeprogresjonen når neste område nås', () => {
    renderFlow();

    for (let index = 0; index < 4; index += 1) {
      fireEvent.input(screen.getByRole('slider'), { target: { value: '4' } });
      fireEvent.click(screen.getByRole('button', { name: 'Neste' }));
      const areaStartButton = screen.queryByRole('button', { name: 'Start området' });
      if (areaStartButton) fireEvent.click(areaStartButton);
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

  it('går direkte til låst innsending etter alle 31 svar uten gjennomgang', async () => {
    const { props } = renderFlow();
    await answerAll((index) => (index % 7) + 1);

    expect(props.onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Svarene er klare til innsending' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Svarene er klare til innsending' })).toHaveFocus();
    expect(screen.getByText('Svarene er låst. De er registrert når du får bekreftelsen.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Prøv innsending igjen' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'Se gjennom svarene dine' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Endre / })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Score /)).not.toBeInTheDocument();
  });

  it('lar låste svar sendes på nytt etter feil uten redigering eller gjennomgang', async () => {
    const onSubmit = vi.fn<(responses: HealthCheckResponseMap) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Nettverksfeil'))
      .mockResolvedValueOnce(undefined);
    renderFlow({ onSubmit, onLeave: vi.fn() });
    await answerAll((index) => (index % 7) + 1);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('Svarene kunne ikke sendes. Prøv igjen.');
    expect(screen.queryByRole('button', { name: /Forrige|^Endre |Tilbake til gjennomgang|Se gjennom svar|Forlat/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByText('Jeg gleder meg som regel til arbeidsdagen.')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Prøv innsending igjen' }));
    });

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1][0]).toEqual(onSubmit.mock.calls[0][0]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Endre / })).not.toBeInTheDocument();
  });

  it('sender en komplett, typet map i malrekkefølge fra siste spørsmål', async () => {
    const onSubmit = vi.fn<(responses: HealthCheckResponseMap) => void>();
    renderFlow({ onSubmit });
    await answerAll((index) => (index % 7) + 1);

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

  it('deaktiverer innsending og viser feil styrt av parent', async () => {
    const { rerender, props } = renderFlow({ onLeave: vi.fn() });
    await answerAll();

    rerender(
      <HealthCheckResponseFlow
        {...props}
        submitting
        submitError="Kunne ikke sende svarene."
      />,
    );

    expect(screen.getByRole('button', { name: 'Sender svar…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Endre / })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Kunne ikke sende svarene.');
    expect(screen.queryByRole('button', { name: 'Forlat' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sender svar…' }));
    expect(props.onSubmit).toHaveBeenCalledOnce();
  });

  it('gjenoppretter svar og posisjon uten intro etter at fanen eller PWA-en åpnes på nytt', async () => {
    const { unmount } = renderFlow({ draftKey: 'room-1:participant-1' });

    fireEvent.input(screen.getByRole('slider'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Neste' }));
    fireEvent.input(screen.getByRole('slider'), { target: { value: '6' } });
    unmount();
    sessionStorage.clear();

    const onSubmit = vi.fn<(responses: HealthCheckResponseMap) => void>();
    renderFlow({ draftKey: 'room-1:participant-1', onSubmit }, false);

    expect(screen.queryByRole('button', { name: 'Start området' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Oppgavene mine gir meg mer energi enn de tapper meg for.',
    );
    expect(screen.getByRole('slider')).toHaveValue('6');
    expect(screen.queryByRole('button', { name: 'Forrige' })).not.toBeInTheDocument();
    await answerAll((index) => index === 1 ? 6 : 4, 1);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0].joy_look_forward).toBe(5);
    expect(Object.values(onSubmit.mock.calls[0][0])).toHaveLength(31);
  });

  it('beholder svar i minnet når localStorage-kvoten er brukt opp', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    const onSubmit = vi.fn<(responses: HealthCheckResponseMap) => void>();
    renderFlow({ draftKey: 'room-1:participant-1', onSubmit });

    fireEvent.input(screen.getByRole('slider'), { target: { value: '6' } });
    expect(screen.getByRole('slider')).toHaveValue('6');
    fireEvent.click(screen.getByRole('button', { name: 'Neste' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Oppgavene mine gir meg mer energi enn de tapper meg for.',
    );
    expect(screen.queryByRole('button', { name: 'Forrige' })).not.toBeInTheDocument();
    await answerAll(() => 4, 1);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0].joy_look_forward).toBe(6);
    expect(Object.values(onSubmit.mock.calls[0][0])).toHaveLength(31);
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
