import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HealthQuestionSlider } from '../../../../domains/health-check/components/HealthQuestionSlider';
import { SQUAD_HEALTH_TEMPLATE_V1 } from '../../../../domains/health-check/domain';

const labels = SQUAD_HEALTH_TEMPLATE_V1.scoreLabels;

describe('HealthQuestionSlider', () => {
  function renderSlider(overrides: Partial<React.ComponentProps<typeof HealthQuestionSlider>> = {}) {
    const props: React.ComponentProps<typeof HealthQuestionSlider> = {
      questionText: 'Jeg gleder meg som regel til arbeidsdagen.',
      scoreLabels: labels,
      touched: false,
      score: undefined,
      onAnswer: vi.fn(),
      onAdvance: vi.fn(),
      ...overrides,
    };
    return { ...render(<HealthQuestionSlider {...props} />), props };
  }

  it('starter visuelt nøytralt og ubesvart uten synlig hjelpetekst', () => {
    const onAnswer = vi.fn();
    renderSlider({ onAnswer });
    const slider = screen.getByRole('slider');

    expect(slider).toHaveValue('4');
    expect(slider).toHaveAttribute('aria-valuetext', 'Ikke besvart');
    expect(slider).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('Ikke besvart')).not.toBeInTheDocument();
    expect(screen.queryByText('Nøytral')).not.toBeInTheDocument();
    expect(screen.queryByText(/Velg hvor enig/)).not.toBeInTheDocument();
    expect(slider).toHaveClass('health-question-slider');
    expect(onAnswer).not.toHaveBeenCalled();
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

    expect(onAnswer).toHaveBeenLastCalledWith(5);
    expect(slider).toHaveAttribute('aria-valuetext', 'Litt enig');
    expect(slider).not.toHaveAttribute('aria-describedby');
    expect(slider.parentElement?.style.getPropertyValue('--health-score-progress')).toBe('66.66666666666666%');
  });

  it('bruker faktisk range-verdi etter tastatur-eventrekkefølgen', () => {
    const onAnswer = vi.fn();
    renderSlider({ onAnswer });
    const slider = screen.getByRole('slider');

    fireEvent.keyDown(slider, { key: 'Home' });

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(1);
    expect(slider).toHaveAttribute('aria-valuetext', 'Svært uenig');
  });

  it('oppdaterer svaret fortløpende ved drag', () => {
    const onAnswer = vi.fn();
    renderSlider({ onAnswer });
    const slider = screen.getByRole('slider');

    fireEvent.input(slider, { target: { value: '6' } });
    fireEvent.input(slider, { target: { value: '7' } });

    expect(onAnswer).toHaveBeenNthCalledWith(1, 6);
    expect(onAnswer).toHaveBeenNthCalledWith(2, 7);
    expect(slider).toHaveAttribute('aria-valuetext', 'Svært enig');
  });

  it('beveger slideren kontinuerlig, men runder svaret til ett av syv nivåer', () => {
    const onAnswer = vi.fn();
    renderSlider({ onAnswer });
    const slider = screen.getByRole('slider');

    expect(slider).toHaveAttribute('step', '1');
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 600, width: 600, top: 0, bottom: 52, height: 52,
      x: 0, y: 0, toJSON: () => ({}),
    });
    fireEvent.pointerDown(slider, { pointerId: 1 });
    fireEvent.pointerMove(slider, { pointerId: 1 });
    const moveEvent = new Event('pointermove', { bubbles: true });
    Object.defineProperty(moveEvent, 'clientX', { value: 462 });
    act(() => fireEvent(slider, moveEvent));

    expect(slider).toHaveValue('6');
    expect(onAnswer).toHaveBeenLastCalledWith(6);
    expect(slider).toHaveAttribute('aria-valuetext', 'Enig');
    expect(slider.parentElement?.style.getPropertyValue('--health-score-progress')).toBe('77%');
    const upEvent = new Event('pointerup', { bubbles: true });
    Object.defineProperty(upEvent, 'clientX', { value: 462 });
    act(() => fireEvent(slider, upEvent));
    expect(slider).toHaveValue('6');
  });

  it('går aldri videre uten eksplisitt trykk på Neste', () => {
    vi.useFakeTimers();
    const onAdvance = vi.fn();
    renderSlider({ onAdvance });
    const slider = screen.getByRole('slider');

    fireEvent.input(slider, { target: { value: '6' } });
    act(() => vi.advanceTimersByTime(5000));
    expect(onAdvance).not.toHaveBeenCalled();
    expect(screen.queryByText(/Neste spørsmål om/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Neste' }));
    expect(onAdvance).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

});
