import { useEffect, useRef } from 'react';
import type { HealthCheckResponseMap, HealthCheckTemplate, QuestionKey } from '../domain';

export interface HealthResponseReviewProps {
  readonly template: HealthCheckTemplate;
  readonly responses: HealthCheckResponseMap;
  readonly submitting: boolean;
  readonly submitError: string | null | undefined;
  readonly onEdit: (questionKey: QuestionKey) => void;
  readonly onSubmit: (responses: HealthCheckResponseMap) => Promise<void> | void;
}

export function HealthResponseReview({
  template,
  responses,
  submitting,
  submitError,
  onEdit,
  onSubmit,
}: HealthResponseReviewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="health-review-heading" aria-busy={submitting}>
      <h1
        ref={headingRef}
        tabIndex={-1}
        id="health-review-heading"
        className="rounded-sm text-2xl font-bold focus:ring-2 focus:ring-[var(--color-navy-700)] focus:ring-offset-4"
        style={{ color: 'var(--color-navy-900)' }}
      >
        Se gjennom svarene dine
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--color-neutral-500)' }}>
        Kontroller svarene før du sender dem inn.
      </p>

      <div className="mt-8 space-y-8">
        {template.areas.map((area) => (
          <section key={area.key} aria-labelledby={`review-area-${area.key}`}>
            <h2
              id={`review-area-${area.key}`}
              className="text-lg font-bold"
              style={{ color: 'var(--color-navy-900)' }}
            >
              {area.title}
            </h2>
            <ul className="mt-3 space-y-3">
              {area.questions.map((question) => {
                const response = responses[question.key];
                return (
                  <li
                    key={question.key}
                    className="rounded-lg border bg-white p-4"
                    style={{ borderColor: 'var(--color-neutral-200)' }}
                  >
                    <p className="font-medium" style={{ color: 'var(--color-neutral-900)' }}>
                      {question.text}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm" style={{ color: 'var(--color-neutral-700)' }}>
                        {template.scoreLabels[response]}
                      </span>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => onEdit(question.key)}
                        aria-label={`Endre ${question.text}`}
                        className="rounded-md border px-4 text-sm font-bold focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                        style={{
                          minHeight: 44,
                          borderColor: 'var(--color-navy-500)',
                          color: 'var(--color-navy-700)',
                        }}
                      >
                        Endre
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {submitError ? (
        <p role="alert" className="mt-6 text-sm" style={{ color: 'var(--color-danger)' }}>
          {submitError}
        </p>
      ) : null}

      <button
        type="button"
        disabled={submitting}
        onClick={() => onSubmit(responses)}
        className="mt-6 w-full rounded-lg px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        style={{ minHeight: 52, background: 'var(--color-red-600)' }}
      >
        {submitting ? 'Sender svar…' : 'Send svar'}
      </button>
    </section>
  );
}
