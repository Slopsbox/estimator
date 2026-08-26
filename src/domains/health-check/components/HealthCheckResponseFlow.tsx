import { useEffect, useRef, useState } from 'react';
import {
  SQUAD_HEALTH_TEMPLATE_V1,
  flattenHealthCheckQuestions,
  type HealthCheckResponseMap,
  type HealthCheckTemplate,
  type QuestionKey,
  type SevenPointScore,
} from '../domain';
import { useHealthCheckDraft } from '../hooks';
import { HealthQuestionSlider } from './HealthQuestionSlider';
import { HealthResponseReview } from './HealthResponseReview';

export interface HealthCheckResponseFlowProps {
  readonly template?: HealthCheckTemplate;
  readonly participantName?: string;
  readonly autoAdvanceDefault?: boolean;
  readonly submitting: boolean;
  readonly submitError: string | null | undefined;
  readonly onSubmit: (responses: HealthCheckResponseMap) => Promise<void> | void;
  readonly onLeave?: () => void;
  readonly confirmDiscard?: () => boolean;
  /** Parent routes use this signal to block in-app navigation with an unsent draft. */
  readonly onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
}

export function HealthCheckResponseFlow({
  template = SQUAD_HEALTH_TEMPLATE_V1,
  participantName,
  autoAdvanceDefault = true,
  submitting,
  submitError,
  onSubmit,
  onLeave,
  confirmDiscard = () => window.confirm('Du har usendte svar. Vil du forlate helsesjekken?'),
  onUnsavedChangesChange,
}: HealthCheckResponseFlowProps) {
  const [state, dispatch] = useHealthCheckDraft();
  const [autoAdvance, setAutoAdvance] = useState(autoAdvanceDefault);
  const [announcementSequence, setAnnouncementSequence] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const unsavedChangesCallbackRef = useRef(onUnsavedChangesChange);
  const previousScreenRef = useRef(`${state.view}:${state.currentQuestionIndex}`);
  const questions = flattenHealthCheckQuestions(template);
  const question = questions[state.currentQuestionIndex];
  const area = template.areas.find((candidate) =>
    candidate.questions.some((candidateQuestion) => candidateQuestion.key === question.key),
  );
  const response = state.responses[question.key];
  const allAnswered = questions.every((candidate) => state.responses[candidate.key] !== undefined);
  const hasDraft = Object.keys(state.responses).length > 0;

  useEffect(() => {
    unsavedChangesCallbackRef.current = onUnsavedChangesChange;
  }, [onUnsavedChangesChange]);

  useEffect(() => {
    if (!hasDraft) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasDraft]);

  useEffect(() => {
    unsavedChangesCallbackRef.current?.(hasDraft);
  }, [hasDraft]);

  useEffect(
    () => () => unsavedChangesCallbackRef.current?.(false),
    [],
  );

  useEffect(() => {
    const screen = `${state.view}:${state.currentQuestionIndex}`;
    if (screen !== previousScreenRef.current && state.view === 'question') {
      headingRef.current?.focus();
    }
    previousScreenRef.current = screen;
  }, [state.currentQuestionIndex, state.view]);

  const goNext = () => {
    const movesToQuestion =
      !state.returnToReview && state.currentQuestionIndex < questions.length - 1;
    dispatch({
      type: 'next',
      questionCount: questions.length,
      canReview: allAnswered,
    });
    if (movesToQuestion) setAnnouncementSequence((sequence) => sequence + 1);
  };

  const completeResponses = (): HealthCheckResponseMap =>
    Object.fromEntries(
      questions.map((candidate) => [candidate.key, state.responses[candidate.key]]),
    ) as HealthCheckResponseMap;

  if (state.view === 'review' && allAnswered) {
    const responses = completeResponses();
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <HealthResponseReview
          template={template}
          responses={responses}
          submitting={submitting}
          submitError={submitError}
          onEdit={(questionKey: QuestionKey) => {
            const questionIndex = questions.findIndex((candidate) => candidate.key === questionKey);
            if (questionIndex >= 0) dispatch({ type: 'edit', questionIndex });
          }}
          onSubmit={onSubmit}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex min-h-11 items-center justify-between gap-3">
        {onLeave ? (
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              if (!hasDraft || confirmDiscard()) onLeave();
            }}
            className="rounded-md px-3 text-sm font-bold focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ minHeight: 44, color: 'var(--color-navy-700)' }}
          >
            Forlat
          </button>
        ) : (
          <span />
        )}
        <label className="flex min-h-11 items-center gap-2 text-sm" style={{ color: 'var(--color-neutral-700)' }}>
          <input
            type="checkbox"
            role="switch"
            checked={autoAdvance}
            aria-checked={autoAdvance}
            onChange={(event) => setAutoAdvance(event.currentTarget.checked)}
            style={{ width: 24, height: 24, accentColor: 'var(--color-red-600)' }}
          />
          Gå automatisk til neste spørsmål
        </label>
      </div>

      {participantName ? (
        <p className="mt-4 break-words text-sm" style={{ color: 'var(--color-neutral-500)' }}>
          Svarer som: {participantName}
        </p>
      ) : null}

      <p className="mt-6 text-sm font-bold" style={{ color: 'var(--color-red-600)' }}>
        Spørsmål {state.currentQuestionIndex + 1} av {questions.length}
      </p>
      <p className="mt-4 text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--color-navy-500)' }}>
        {area?.title}
      </p>
      <p className="mt-1 text-sm" style={{ color: 'var(--color-neutral-500)' }}>
        {area?.introduction}
      </p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-5 rounded-sm text-2xl font-bold focus:ring-2 focus:ring-[var(--color-navy-700)] focus:ring-offset-4 sm:text-3xl"
        style={{ color: 'var(--color-navy-900)' }}
      >
        {question.text}
      </h1>

      <div className="mt-8 rounded-xl border bg-white p-5 sm:p-8" style={{ borderColor: 'var(--color-neutral-200)' }}>
        <HealthQuestionSlider
          key={`${question.key}:${autoAdvance ? 'auto' : 'manual'}`}
          questionText={question.text}
          scoreLabels={template.scoreLabels}
          touched={response !== undefined}
          score={response}
          autoAdvance={autoAdvance}
          nextLabel={state.returnToReview ? 'Tilbake til gjennomgang' : state.currentQuestionIndex === questions.length - 1 ? 'Se gjennom svar' : 'Neste'}
          onAnswer={(score: SevenPointScore) =>
            dispatch({ type: 'answer', questionKey: question.key, score })
          }
          onAdvance={goNext}
        />
      </div>

      {state.currentQuestionIndex > 0 && !state.returnToReview ? (
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'previous' });
          }}
          className="mt-4 rounded-md px-4 text-sm font-bold"
          style={{ minHeight: 44, color: 'var(--color-navy-700)' }}
        >
          Forrige
        </button>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announcementSequence > 0 ? (
          <span key={announcementSequence}>Går til neste spørsmål</span>
        ) : null}
      </p>
    </main>
  );
}
