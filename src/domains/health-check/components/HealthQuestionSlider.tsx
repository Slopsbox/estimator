import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { HealthCheckTemplate, SevenPointScore } from '../domain';

const SCORE_EMOJI: Readonly<Record<SevenPointScore, string>> = {
  1: '😞',
  2: '🙁',
  3: '😕',
  4: '😐',
  5: '🙂',
  6: '😊',
  7: '😄',
};

interface SliderStyle extends CSSProperties {
  '--health-score-progress': string;
}

export interface HealthQuestionSliderProps {
  readonly questionText: string;
  readonly scoreLabels: HealthCheckTemplate['scoreLabels'];
  readonly touched: boolean;
  readonly score: SevenPointScore | undefined;
  readonly nextLabel?: string;
  readonly onAnswer: (score: SevenPointScore) => void;
  readonly onAdvance: () => void;
}

function parseScore(value: string): SevenPointScore | undefined {
  const score = Number(value);
  return Number.isInteger(score) && score >= 1 && score <= 7
    ? (score as SevenPointScore)
    : undefined;
}

export function HealthQuestionSlider({
  questionText,
  scoreLabels,
  touched,
  score,
  nextLabel = 'Neste',
  onAnswer,
  onAdvance,
}: HealthQuestionSliderProps) {
  const [localAnswer, setLocalAnswer] = useState<{
    readonly questionText: string;
    readonly score: SevenPointScore;
  } | null>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const pointerInputRef = useRef(false);
  const hasLocalAnswer = localAnswer?.questionText === questionText;
  const isTouched = touched || hasLocalAnswer;
  const selectedScore = hasLocalAnswer ? localAnswer.score : (score ?? 4);
  const visualValue = dragValue ?? selectedScore;
  const sliderStyle: SliderStyle = {
    '--health-score-progress': `${((visualValue - 1) / 6) * 100}%`,
  };

  const handleInput = (value: string) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    setDragValue(numericValue);
    const nextScore = parseScore(String(Math.round(numericValue)));
    if (nextScore === undefined) return;

    setLocalAnswer({ questionText, score: nextScore });
    onAnswer(nextScore);
  };

  const answerAtPointer = (event: PointerEvent<HTMLInputElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || !Number.isFinite(event.clientX)) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const continuousValue = 1 + ratio * 6;
    const nextScore = Math.round(continuousValue) as SevenPointScore;
    setDragValue(continuousValue);
    setLocalAnswer({ questionText, score: nextScore });
    onAnswer(nextScore);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    let nextScore: SevenPointScore | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      nextScore = Math.min(7, selectedScore + 1) as SevenPointScore;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      nextScore = Math.max(1, selectedScore - 1) as SevenPointScore;
    } else if (event.key === 'Home') {
      nextScore = 1;
    } else if (event.key === 'End') {
      nextScore = 7;
    }
    if (nextScore === undefined) return;
    event.preventDefault();
    setDragValue(null);
    setLocalAnswer({ questionText, score: nextScore });
    onAnswer(nextScore);
  };

  return (
    <div>
      <div className="flex min-h-24 flex-col items-center justify-center text-center">
        <span aria-hidden="true" className="text-[3.5rem] leading-none">
          {SCORE_EMOJI[selectedScore]}
        </span>
        <p
          className="mt-3 min-h-6 text-base font-bold"
          style={{ color: 'var(--color-navy-700)' }}
          aria-hidden={!isTouched}
        >
          {isTouched ? scoreLabels[selectedScore] : null}
        </p>
      </div>

      <div
        className={`health-slider-shell ${isTouched ? 'health-slider-shell--touched' : ''}`}
        style={sliderStyle}
      >
        <div className="health-slider-visual" aria-hidden="true">
          <span className="health-slider-fill" />
          <span className="health-slider-thumb" />
        </div>
        <input
          type="range"
          min={1}
          max={7}
          step={1}
          value={selectedScore}
          aria-label={`Svar på: ${questionText}`}
          aria-valuetext={isTouched ? scoreLabels[selectedScore] : 'Ikke besvart'}
          onPointerDown={(event) => {
            pointerInputRef.current = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            answerAtPointer(event);
          }}
          onPointerMove={(event) => {
            if (pointerInputRef.current) answerAtPointer(event);
          }}
          onInput={(event) => {
            if (!pointerInputRef.current) handleInput(event.currentTarget.value);
          }}
          onKeyDown={handleKeyDown}
          onPointerUp={(event) => {
            answerAtPointer(event);
            pointerInputRef.current = false;
            setDragValue(null);
          }}
          onPointerCancel={() => {
            pointerInputRef.current = false;
            setDragValue(null);
          }}
          className="health-question-slider"
        />
      </div>

      <button
        type="button"
        disabled={!isTouched}
        onClick={onAdvance}
        className="mt-6 min-h-[52px] w-full touch-manipulation rounded-lg bg-[var(--color-red-600)] px-4 font-bold text-white transition-colors hover:bg-[var(--color-red-700)] focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2 active:bg-[var(--color-red-900)] disabled:cursor-not-allowed disabled:bg-[var(--color-neutral-300)] disabled:text-[var(--color-neutral-700)]"
      >
        {nextLabel}
      </button>
    </div>
  );
}
