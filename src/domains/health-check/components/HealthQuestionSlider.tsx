import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { HealthCheckTemplate, SevenPointScore } from '../domain';

const SCORE_PRESENTATION: Readonly<
  Record<SevenPointScore, { readonly emoji: string; readonly color: string }>
> = {
  1: { emoji: '😞', color: 'var(--color-danger)' },
  2: { emoji: '🙁', color: 'var(--color-danger)' },
  3: { emoji: '😕', color: 'var(--color-navy-700)' },
  4: { emoji: '😐', color: 'var(--color-neutral-500)' },
  5: { emoji: '🙂', color: 'var(--color-success)' },
  6: { emoji: '😊', color: 'var(--color-success)' },
  7: { emoji: '😄', color: 'var(--color-success)' },
};

const KEYBOARD_RANGE_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
]);

export interface HealthQuestionSliderProps {
  readonly questionText: string;
  readonly scoreLabels: HealthCheckTemplate['scoreLabels'];
  readonly touched: boolean;
  readonly score: SevenPointScore | undefined;
  readonly autoAdvance: boolean;
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
  autoAdvance,
  nextLabel = 'Neste',
  onAnswer,
  onAdvance,
}: HealthQuestionSliderProps) {
  const [localScore, setLocalScore] = useState<SevenPointScore>(score ?? 4);
  const [locallyTouched, setLocallyTouched] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const instructionId = useId();
  const isTouched = touched || locallyTouched;
  const selectedScore = locallyTouched ? localScore : (score ?? 4);
  const presentation = SCORE_PRESENTATION[selectedScore];
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerActiveRef = useRef(false);
  const pointerInputRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const latestScoreRef = useRef<SevenPointScore>(selectedScore);
  const onAdvanceRef = useRef(onAdvance);
  const autoAdvanceRef = useRef(autoAdvance);
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  const cancelCountdown = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCountdown(null);
  }, []);

  const startCountdown = useCallback(() => {
    cancelCountdown();
    if (!autoAdvance) return;

    let remaining = 3;
    setCountdown(remaining);
    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining === 0 || !autoAdvanceRef.current) {
        if (timerRef.current !== null) clearInterval(timerRef.current);
        timerRef.current = null;
        setCountdown(null);
        if (autoAdvanceRef.current) onAdvanceRef.current();
        return;
      }
      setCountdown(remaining);
    }, 1000);
  }, [autoAdvance, cancelCountdown]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    },
    [],
  );

  const answer = useCallback((nextScore: SevenPointScore) => {
    latestScoreRef.current = nextScore;
    setLocalScore(nextScore);
    setLocallyTouched(true);
    onAnswer(nextScore);
  }, [onAnswer]);

  const handleInput = (value: string) => {
    cancelCountdown();
    const nextScore = parseScore(value);
    if (nextScore === undefined) return;
    if (pointerActiveRef.current) pointerInputRef.current = true;
    answer(nextScore);
    if (!pointerActiveRef.current) startCountdown();
  };

  const finishPointerInteraction = useCallback(() => {
    if (!pointerActiveRef.current) return;
    pointerActiveRef.current = false;
    const releasedScore = parseScore(inputRef.current?.value ?? '') ?? latestScoreRef.current;
    if (!pointerInputRef.current) answer(releasedScore);
    pointerInputRef.current = false;
    startCountdown();
  }, [answer, startCountdown]);

  useEffect(() => {
    window.addEventListener('pointerup', finishPointerInteraction);
    return () => window.removeEventListener('pointerup', finishPointerInteraction);
  }, [finishPointerInteraction]);

  return (
    <div>
      <div className="flex min-h-24 flex-col items-center justify-center text-center">
        <span aria-hidden="true" className="text-4xl">
          {presentation.emoji}
        </span>
        <p
          className="mt-2 text-base font-bold"
          style={{ color: isTouched ? presentation.color : 'var(--color-neutral-500)' }}
        >
          {isTouched ? scoreLabels[selectedScore] : 'Ikke besvart'}
        </p>
      </div>

      <p id={instructionId} className="mb-3 text-sm" style={{ color: 'var(--color-neutral-500)' }}>
        {autoAdvance
          ? 'Velg hvor enig du er. Skalaen er ikke besvart før du bruker den. Etter valg går du automatisk videre om 3 sekunder. Trykk Escape eller bruk skalaen igjen for å avbryte.'
          : 'Velg hvor enig du er. Skalaen er ikke besvart før du bruker den. Trykk Neste når du er klar.'}
      </p>
      <input
        ref={inputRef}
        type="range"
        min={1}
        max={7}
        step={1}
        value={selectedScore}
        aria-label={`Svar på: ${questionText}`}
        aria-valuetext={isTouched ? scoreLabels[selectedScore] : 'Ikke besvart'}
        aria-describedby={instructionId}
        onPointerDown={() => {
          pointerActiveRef.current = true;
          pointerInputRef.current = false;
          cancelCountdown();
        }}
        onPointerUp={finishPointerInteraction}
        onPointerCancel={() => {
          pointerActiveRef.current = false;
          pointerInputRef.current = false;
          cancelCountdown();
        }}
        onInput={(event) => handleInput(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            cancelCountdown();
            return;
          }
          if (KEYBOARD_RANGE_KEYS.has(event.key)) {
            cancelCountdown();
          }
        }}
        className="w-full"
        style={{ minHeight: 44, accentColor: presentation.color }}
      />

      <div className="mt-3 min-h-6 text-center" aria-hidden="true">
        {autoAdvance && countdown !== null ? (
          <span className="text-sm font-medium" style={{ color: 'var(--color-neutral-700)' }}>
            Neste spørsmål om {countdown}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        disabled={!isTouched}
        onClick={() => {
          cancelCountdown();
          onAdvanceRef.current();
        }}
        className="mt-3 w-full rounded-lg px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        style={{ minHeight: 48, background: 'var(--color-red-600)' }}
      >
        {nextLabel}
      </button>
    </div>
  );
}
