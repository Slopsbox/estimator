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

export interface HealthCheckResponseFlowProps {
  readonly template?: HealthCheckTemplate;
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
  const [introAreaKey, setIntroAreaKey] = useState<string | null>(() =>
    state.currentQuestionIndex === 0 && state.view === 'question' ? template.areas[0].key : null);
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const sendLock = useRef(false);
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
    const screen = `${state.view}:${state.currentQuestionIndex}:${introAreaKey}`;
    if (screen !== previousScreenRef.current) {
      headingRef.current?.focus();
    }
    previousScreenRef.current = screen;
  }, [state.currentQuestionIndex, state.view, introAreaKey]);

  const sendResponses = async () => {
    if (!allAnswered || submitting || sendLock.current) return;
    sendLock.current = true;
    setSending(true);
    setLocalError(null);
    try {
      await onSubmit(completeResponses());
    } catch {
      setLocalError('Svarene kunne ikke sendes. Prøv igjen.');
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  };

  const goNext = () => {
    if (response === undefined || state.view !== 'question') return;
    const movesToQuestion = state.currentQuestionIndex < questions.length - 1;
    dispatch({
      type: 'next',
      questionCount: questions.length,
    });
    if (movesToQuestion) {
      const nextArea = template.areas.find(candidate => candidate.questions.some(q => q.key === questions[state.currentQuestionIndex + 1].key));
      if (nextArea && nextArea.key !== area?.key) setIntroAreaKey(nextArea.key);
      setAnnouncementSequence((sequence) => sequence + 1);
    } else {
      void sendResponses();
    }
  };

  const completeResponses = (): HealthCheckResponseMap =>
    Object.fromEntries(
      questions.map((candidate) => [candidate.key, state.responses[candidate.key]]),
    ) as HealthCheckResponseMap;

  if (state.view === 'submit' && allAnswered) {
    return (
      <main className="health-response-main mx-auto w-full max-w-3xl py-8">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold">{sending || submitting ? 'Sender svar…' : 'Svarene er klare til innsending'}</h1>
        <p className="mt-3">Svarene er låst. De er registrert når du får bekreftelsen.</p>
        {submitError || localError ? <p role="alert" className="mt-4 text-[var(--color-danger)]">{submitError || localError}</p> : null}
        <button type="button" disabled={sending || submitting} onClick={() => void sendResponses()} className="mt-6 min-h-[52px] w-full rounded-lg bg-[var(--color-red-600)] px-4 font-bold text-white focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2 disabled:opacity-40">
          {sending || submitting ? 'Sender svar…' : 'Prøv innsending igjen'}
        </button>
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

      {onLeave ? (
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
          ) : null}
        </div>
      ) : null}

      {introAreaKey === area?.key ? (
        <AreaIntro
          area={area}
          areaIndex={areaIndex}
          areaCount={template.areas.length}
          onStart={() => setIntroAreaKey(null)}
        />
      ) : (
        <>
          <AreaContext area={area} areaIndex={areaIndex} areaCount={template.areas.length} />
          <p className="mt-3 text-sm text-[var(--color-neutral-700)]">Når du trykker «Neste», kan svaret ikke endres.</p>
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
              key={question.key}
              questionText={question.text}
              scoreLabels={template.scoreLabels}
              touched={response !== undefined}
              score={response}
              nextLabel={state.currentQuestionIndex === questions.length - 1 ? 'Send svar' : 'Neste'}
              onAnswer={(score: SevenPointScore) => dispatch({ type: 'answer', questionKey: question.key, score })}
              onAdvance={goNext}
            />
          </div>
        </>
      )}

      <p aria-live="polite" className="sr-only">
        {announcementSequence > 0 ? (
          <span key={announcementSequence}>Går til neste spørsmål</span>
        ) : null}
      </p>
    </main>
  );
}

function AreaIntro({
  area,
  areaIndex,
  areaCount,
  onStart,
}: {
  readonly area: HealthCheckTemplate['areas'][number] | undefined;
  readonly areaIndex: number;
  readonly areaCount: number;
  readonly onStart: () => void;
}) {
  if (!area) return null;
  return (
    <section aria-labelledby="health-area-intro-heading" className="animate-fadeUp mt-10 sm:mt-12">
      <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-red-600)' }}>
        Område {areaIndex + 1} av {areaCount}
      </p>
      <h1 id="health-area-intro-heading" className="mt-3 max-w-2xl text-4xl font-bold leading-tight text-balance sm:text-5xl" style={{ color: 'var(--color-navy-900)' }}>
        {area.title}
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed sm:text-xl" style={{ color: 'var(--color-neutral-700)' }}>
        {area.introduction}
      </p>
      <p className="mt-5 text-sm font-bold" style={{ color: 'var(--color-navy-700)' }}>
        {area.questions.length} spørsmål i dette området
      </p>
      {areaIndex > 0 ? (
        <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--color-success)' }} aria-live="polite">
          Bra jobbet — du er videre til neste tema.
        </p>
      ) : null}
      <button type="button" onClick={onStart} className="mt-8 min-h-[52px] w-full touch-manipulation rounded-lg bg-[var(--color-red-600)] px-5 font-bold text-white transition-colors hover:bg-[var(--color-red-700)] focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2 sm:w-auto">
        Start området
      </button>
    </section>
  );
}

function AreaContext({
  area,
  areaIndex,
  areaCount,
}: {
  readonly area: HealthCheckTemplate['areas'][number] | undefined;
  readonly areaIndex: number;
  readonly areaCount: number;
}) {
  if (!area) return null;
  return (
    <div className="mt-10 sm:mt-12">
      <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-red-600)' }}>
        Område {areaIndex + 1} av {areaCount}
      </p>
      <h2 className="mt-2 text-xl font-bold" style={{ color: 'var(--color-navy-900)' }}>{area.title}</h2>
      <p className="mt-1 max-w-xl text-base leading-relaxed" style={{ color: 'var(--color-neutral-700)' }}>{area.introduction}</p>
    </div>
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
