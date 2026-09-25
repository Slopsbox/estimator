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
  readonly submitting: boolean;
  readonly submitError: string | null | undefined;
  readonly onSubmit: (responses: HealthCheckResponseMap) => Promise<void> | void;
  readonly draftKey?: string;
  readonly draftExpiresAt?: string;
  readonly onLeave?: () => void;
  readonly confirmDiscard?: () => boolean;
  /** Parent routes use this signal to block in-app navigation with an unsent draft. */
  readonly onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
}

export function HealthCheckResponseFlow({
  template = SQUAD_HEALTH_TEMPLATE_V1,
  participantName,
  submitting,
  submitError,
  onSubmit,
  draftKey,
  draftExpiresAt,
  onLeave,
  confirmDiscard = () => window.confirm('Du har usendte svar. Vil du forlate helsesjekken?'),
  onUnsavedChangesChange,
}: HealthCheckResponseFlowProps) {
  const [state, dispatch] = useHealthCheckDraft(draftKey, draftExpiresAt);
  const [announcementSequence, setAnnouncementSequence] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const unsavedChangesCallbackRef = useRef(onUnsavedChangesChange);
  const previousScreenRef = useRef('');
  const questions = flattenHealthCheckQuestions(template);
  const question = questions[state.currentQuestionIndex];
  const area = template.areas.find((candidate) =>
    candidate.questions.some((candidateQuestion) => candidateQuestion.key === question.key),
  );
  const areaIndex = template.areas.findIndex((candidate) => candidate.key === area?.key);
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
      <main className="health-response-main mx-auto w-full max-w-3xl py-8">
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
    <main className="health-response-main mx-auto w-full max-w-2xl">
      <AreaProgress
        template={template}
        currentAreaIndex={areaIndex}
        currentQuestionKey={question.key}
        currentQuestionIndex={state.currentQuestionIndex}
        questionCount={questions.length}
      />

      {onLeave || participantName ? (
        <div className="mt-5 flex min-h-11 items-center justify-between gap-3">
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
          {participantName ? <ParticipantIdentity participantName={participantName} /> : null}
        </div>
      ) : null}

      <div className="mt-10 flex items-center gap-3 sm:mt-12">
        <span className="h-6 w-1 rounded-full" style={{ background: 'var(--color-red-600)' }} aria-hidden="true" />
        <p className="text-sm font-bold" style={{ color: 'var(--color-navy-700)' }}>
          {area?.title}
        </p>
      </div>
      <p className="mt-2 text-sm italic sm:text-base" style={{ color: 'var(--color-neutral-500)' }}>
        {area?.introduction}
      </p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-5 max-w-xl text-3xl font-bold leading-tight text-balance focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-4 sm:text-4xl"
        style={{ color: 'var(--color-navy-900)' }}
      >
        {question.text}
      </h1>

      <div className="mt-8 border-t pt-6 sm:mt-10 sm:pt-8" style={{ borderColor: 'var(--color-neutral-200)' }}>
        <HealthQuestionSlider
          questionText={question.text}
          scoreLabels={template.scoreLabels}
          touched={response !== undefined}
          score={response}
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
          className="mt-4 min-h-11 touch-manipulation rounded-md px-4 text-sm font-bold focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2"
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

function AreaProgress({
  template,
  currentAreaIndex,
  currentQuestionKey,
  currentQuestionIndex,
  questionCount,
}: {
  readonly template: HealthCheckTemplate;
  readonly currentAreaIndex: number;
  readonly currentQuestionKey: QuestionKey;
  readonly currentQuestionIndex: number;
  readonly questionCount: number;
}) {
  const currentArea = template.areas[currentAreaIndex];
  const currentAreaQuestionIndex = currentArea?.questions.findIndex(
    (candidate) => candidate.key === currentQuestionKey,
  ) ?? 0;
  const currentAreaProgress = currentArea
    ? (currentAreaQuestionIndex + 1) / currentArea.questions.length
    : 0;

  return (
    <div
      role="progressbar"
      aria-label="Fremdrift gjennom helsesjekken"
      aria-valuemin={1}
      aria-valuemax={questionCount}
      aria-valuenow={currentQuestionIndex + 1}
      aria-valuetext={`Spørsmål ${currentQuestionIndex + 1} av ${questionCount}, ${currentArea?.title ?? 'Helsesjekk'}`}
      className="flex gap-1.5"
    >
      {template.areas.map((candidate, index) => {
        const state = index < currentAreaIndex
          ? 'completed'
          : index === currentAreaIndex
            ? 'current'
            : 'future';

        return (
          <span
            key={candidate.key}
            data-area-progress-segment
            data-state={state}
            className="h-2 flex-1 overflow-hidden rounded-full border"
            style={{
              background: 'var(--color-neutral-100)',
              borderColor: 'var(--color-neutral-500)',
            }}
            aria-hidden="true"
          >
            <span
              className="health-area-progress-fill block h-full origin-left rounded-full transition-transform duration-200"
              style={{
                background: state === 'current'
                  ? 'var(--color-red-600)'
                  : 'var(--color-navy-700)',
                transform: state === 'future'
                  ? 'scaleX(0)'
                  : state === 'current'
                    ? `scaleX(${currentAreaProgress})`
                    : 'scaleX(1)',
              }}
            />
          </span>
        );
      })}
    </div>
  );
}

function ParticipantIdentity({ participantName }: { readonly participantName: string }) {
  return (
    <div
      role="group"
      aria-label={`Svar som ${participantName}`}
      className="flex min-w-0 max-w-[70%] items-center gap-2 rounded-full px-3 py-2"
      style={{ background: 'var(--color-neutral-200)', color: 'var(--color-navy-900)' }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="8" r="3" />
        <path d="M5.5 19c.8-3.1 3-4.7 6.5-4.7s5.7 1.6 6.5 4.7" />
      </svg>
      <span className="shrink-0 text-xs" style={{ color: 'var(--color-neutral-700)' }}>
        Svar som
      </span>
      <span className="truncate text-sm font-bold">{participantName}</span>
    </div>
  );
}
