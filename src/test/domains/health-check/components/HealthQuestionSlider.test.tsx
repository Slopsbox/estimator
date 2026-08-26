import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthQuestionSlider } from '../../../../domains/health-check/components/HealthQuestionSlider';
import { SQUAD_HEALTH_TEMPLATE_V1 } from '../../../../domains/health-check/domain';

const labels = SQUAD_HEALTH_TEMPLATE_V1.scoreLabels;

describe('HealthQuestionSlider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderSlider(overrides: Partial<React.ComponentProps<typeof HealthQuestionSlider>> = {}) {
    const props: React.ComponentProps<typeof HealthQuestionSlider> = {
      questionText: 'Jeg gleder meg som regel til arbeidsdagen.',
      scoreLabels: labels,
      touched: false,
      score: undefined,
      autoAdvance: true,
      onAnswer: vi.fn(),
      onAdvance: vi.fn(),
      ...overrides,
    };
    return { ...render(<HealthQuestionSlider {...props} />), props };
  }

  it('starter visuelt nøytralt, men ubesvart, og nøytralt pointertrykk teller som svar', () => {
    const onAnswer = vi.fn();
    renderSlider({ onAnswer });
    const slider = screen.getByRole('slider');

    expect(slider).toHaveValue('4');
    expect(slider).toHaveAttribute('aria-valuetext', 'Ikke besvart');
    expect(screen.getByText('Ikke besvart')).toBeVisible();
    expect(screen.queryByText('Nøytral')).not.toBeInTheDocument();

    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(slider);

    expect(onAnswer).toHaveBeenCalledWith(4);
    expect(screen.getByText('Neste spørsmål om 3')).toBeVisible();
  });

  it.each([
    [1, 'Svært uenig'],
    [2, 'Uenig'],
    [3, 'Litt uenig'],
    [4, 'Nøytral'],
    [5, 'Litt enig'],
    [6, 'Enig'],
    [7, 'Svært enig'],
  ] as const)('viser verbal etikett for trinn %i uten synlig tallskala', (score, label) => {
    const { container } = renderSlider({ touched: true, score });

    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', label);
    expect(screen.getByText(label)).toBeVisible();
    expect(container.querySelectorAll('datalist, [data-score], ol')).toHaveLength(0);
  });

  it('oppdaterer aria-valuetext ved tastaturinput', () => {
    const onAnswer = vi.fn();
    renderSlider({ touched: true, score: 4, onAnswer });
    const slider = screen.getByRole('slider');

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.input(slider, { target: { value: '5' } });

    expect(onAnswer).toHaveBeenLastCalledWith(5);
    expect(slider).toHaveAttribute('aria-valuetext', 'Litt enig');
    expect(slider.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('bruker faktisk range-verdi etter tastatur-eventrekkefølgen', () => {
    const onAnswer = vi.fn();
    renderSlider({ onAnswer });
    const slider = screen.getByRole('slider');

    fireEvent.keyDown(slider, { key: 'Home' });
    fireEvent.input(slider, { target: { value: '1' } });

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(1);
    expect(slider).toHaveAttribute('aria-valuetext', 'Svært uenig');
    expect(screen.getByText('Neste spørsmål om 3')).toBeVisible();
  });

  it('sender ett svar og starter én nedtelling for pointer drag med input og release', () => {
    const onAnswer = vi.fn();
    const onAdvance = vi.fn();
    renderSlider({ onAnswer, onAdvance });
    const slider = screen.getByRole('slider');

    fireEvent.pointerDown(slider);
    fireEvent.input(slider, { target: { value: '6' } });
    fireEvent.pointerUp(slider, { target: { value: '6' } });

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(6);
    act(() => vi.advanceTimersByTime(3000));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('fullfører pointer-interaksjon når release skjer utenfor slideren', () => {
    const onAnswer = vi.fn();
    const onAdvance = vi.fn();
    renderSlider({ onAnswer, onAdvance });
    const slider = screen.getByRole('slider');

    fireEvent.pointerDown(slider);
    fireEvent.input(slider, { target: { value: '6' } });
    fireEvent.pointerUp(window);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.input(slider, { target: { value: '5' } });

    expect(onAnswer).toHaveBeenNthCalledWith(1, 6);
    expect(onAnswer).toHaveBeenNthCalledWith(2, 5);
    act(() => vi.advanceTimersByTime(3000));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('teller nøyaktig 3, 2, 1 etter release og går videre etter tre sekunder', () => {
    const onAdvance = vi.fn();
    renderSlider({ onAdvance });
    const slider = screen.getByRole('slider');

    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(slider);
    expect(screen.getByText('Neste spørsmål om 3')).toBeVisible();

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('Neste spørsmål om 2')).toBeVisible();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('Neste spørsmål om 1')).toBeVisible();
    act(() => vi.advanceTimersByTime(1000));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('avbryter ved ny interaksjon og starter på nytt først etter release', () => {
    const onAdvance = vi.fn();
    renderSlider({ onAdvance });
    const slider = screen.getByRole('slider');

    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(slider);
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.pointerDown(slider);
    expect(screen.queryByText(/Neste spørsmål om/)).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    expect(onAdvance).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider);
    expect(screen.getByText('Neste spørsmål om 3')).toBeVisible();
    act(() => vi.advanceTimersByTime(3000));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('debouncer tastatur i tre sekunder og Escape avbryter', () => {
    const onAdvance = vi.fn();
    renderSlider({ touched: true, score: 4, onAdvance });
    const slider = screen.getByRole('slider');

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.input(slider, { target: { value: '5' } });
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.input(slider, { target: { value: '4' } });
    act(() => vi.advanceTimersByTime(2999));
    expect(onAdvance).not.toHaveBeenCalled();
    fireEvent.keyDown(slider, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(1));
    expect(onAdvance).not.toHaveBeenCalled();
    expect(screen.queryByText(/Neste spørsmål om/)).not.toBeInTheDocument();
  });

  it('har ingen nedtelling når auto-advance er av og lar Neste gå videre', () => {
    const onAdvance = vi.fn();
    renderSlider({ touched: true, score: 4, autoAdvance: false, onAdvance });
    const slider = screen.getByRole('slider');

    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(slider);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText(/Neste spørsmål om/)).not.toBeInTheDocument();
    expect(onAdvance).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Neste' }));
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Trykk Neste når du er klar/)).toBeVisible();
  });

  it('rydder timer ved unmount uten state-oppdatering eller console-kall', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onAdvance = vi.fn();
    const { unmount } = renderSlider({ onAdvance });
    const slider = screen.getByRole('slider');

    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(slider);
    unmount();
    act(() => vi.advanceTimersByTime(5000));

    expect(onAdvance).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

});
