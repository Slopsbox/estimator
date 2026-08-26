import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HealthCheckFacilitatorDashboard,
  HealthCheckResponseFlow,
  type HealthCheckDeliveryStatus,
  type HealthCheckProgressRow,
} from '../domains/health-check/components';
import { PrototypeResultPanel } from '../domains/health-check/prototype/PrototypeResultPanel';
import { downloadPrototypeCsv } from '../domains/health-check/prototype/prototypeCsvDownload';
import { createPrototypeReportCsv } from '../domains/health-check/prototype/prototypeReport';

type PreviewRole = 'participant' | 'facilitator';

const initialProgressRows: readonly HealthCheckProgressRow[] = [
  { memberId: 'demo-1', displayName: 'Ada', status: 'completed', isOnline: true },
  { memberId: 'demo-2', displayName: 'Bjørn', status: 'completed', isOnline: true },
  { memberId: 'demo-3', displayName: 'Celine', status: 'completed', isOnline: false },
  { memberId: 'demo-4', displayName: 'David', status: 'completed', isOnline: true },
  { memberId: 'demo-5', displayName: 'Emilie', status: 'completed', isOnline: true },
  { memberId: 'demo-6', displayName: 'Frida', status: 'in_progress', isOnline: true },
];

const actionClassName =
  'min-h-11 rounded-md px-4 text-sm font-bold focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40';

export function HealthCheckPreviewPage() {
  const [role, setRole] = useState<PreviewRole>('participant');
  const [participantAttempt, setParticipantAttempt] = useState(0);
  const [participantSubmitting, setParticipantSubmitting] = useState(false);
  const [participantComplete, setParticipantComplete] = useState(false);
  const [progressRows, setProgressRows] = useState(initialProgressRows);
  const [deliveryStatus, setDeliveryStatus] = useState<HealthCheckDeliveryStatus | null>(null);
  const [demoStatus, setDemoStatus] = useState('');
  const submitTimerRef = useRef<number | undefined>(undefined);
  const participantCompleteHeadingRef = useRef<HTMLHeadingElement>(null);
  const demoStatusRef = useRef<HTMLParagraphElement>(null);

  useEffect(
    () => () => {
      if (submitTimerRef.current !== undefined) window.clearTimeout(submitTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (participantComplete) participantCompleteHeadingRef.current?.focus();
  }, [participantComplete]);

  useEffect(() => {
    if (deliveryStatus === 'ready') demoStatusRef.current?.focus();
  }, [deliveryStatus]);

  const resetParticipant = () => {
    if (submitTimerRef.current !== undefined) window.clearTimeout(submitTimerRef.current);
    setParticipantSubmitting(false);
    setParticipantComplete(false);
    setParticipantAttempt((attempt) => attempt + 1);
  };

  const handleParticipantSubmit = () => {
    setParticipantSubmitting(true);
    submitTimerRef.current = window.setTimeout(() => {
      setParticipantSubmitting(false);
      setParticipantComplete(true);
      submitTimerRef.current = undefined;
    }, 450);
  };

  const resetFacilitator = () => {
    setProgressRows(initialProgressRows);
    setDeliveryStatus(null);
    setDemoStatus('Demoen er tilbakestilt.');
  };

  const handleDownload = () => {
    const downloaded = downloadPrototypeCsv(createPrototypeReportCsv(), {
      createBlob: (text, mediaType) => new Blob([text], { type: mediaType }),
      createObjectURL: (blob) => window.URL.createObjectURL(blob),
      revokeObjectURL: (url) => window.URL.revokeObjectURL(url),
      createAnchor: () => document.createElement('a'),
      appendAnchor: (anchor) => document.body.append(anchor as HTMLAnchorElement),
      scheduleCleanup: (cleanup) => window.setTimeout(cleanup, 0),
    });
    setDemoStatus(downloaded
      ? 'Demo: CSV-filen er lastet ned lokalt.'
      : 'Demo: CSV-filen kunne ikke lastes ned.');
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-neutral-100)' }}>
      <header className="border-b bg-white" style={{ borderColor: 'var(--color-neutral-200)' }}>
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="flex min-h-11 items-center rounded-md px-3 text-sm font-bold focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2"
            style={{ color: 'var(--color-navy-700)' }}
          >
            Til forsiden
          </Link>
          <p className="text-sm font-bold" style={{ color: 'var(--color-navy-900)' }}>
            Health Check-demo
          </p>
        </div>
      </header>

      <section aria-label="Demo-innstillinger" className="border-b bg-white" style={{ borderColor: 'var(--color-neutral-200)' }}>
        <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 sm:px-6">
          <p
            role="note"
            className="rounded-lg border px-4 py-3 text-center text-sm font-bold"
            style={{
              borderColor: 'var(--color-warning)',
              color: 'var(--color-neutral-900)',
              background: 'var(--color-neutral-50)',
            }}
          >
            Forhåndsvisning – bruker ingen ekte data
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2" role="group" aria-label="Velg demovisning">
              {(['participant', 'facilitator'] as const).map((candidate) => {
                const active = role === candidate;
                const label = candidate === 'participant' ? 'Deltaker' : 'Fasilitator';
                return (
                  <button
                    key={candidate}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRole(candidate)}
                    className={actionClassName}
                    style={{
                      background: active ? 'var(--color-navy-700)' : 'white',
                      border: '1px solid var(--color-navy-700)',
                      color: active ? 'white' : 'var(--color-navy-700)',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {role === 'facilitator' ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Demo-handlinger">
                <button
                  type="button"
                  disabled={deliveryStatus !== null}
                  onClick={() => {
                    setProgressRows((rows) => rows.map((row) => ({ ...row, status: 'completed' })));
                    setDemoStatus('Demo: Alle deltakere er merket som fullført.');
                  }}
                  className={actionClassName}
                  style={{ border: '1px solid var(--color-neutral-300)', color: 'var(--color-navy-700)' }}
                >
                  Merk alle som fullført
                </button>
                {deliveryStatus === 'awaiting_materialization' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryStatus('ready');
                      setDemoStatus('Demo: Rapporten er klar.');
                    }}
                    className={`${actionClassName} text-white`}
                    style={{ background: 'var(--color-red-600)' }}
                  >
                    Gjør rapport klar
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={resetFacilitator}
                  className={actionClassName}
                  style={{ color: 'var(--color-navy-700)' }}
                >
                  Tilbakestill demo
                </button>
              </div>
            ) : null}
          </div>

          <p
            ref={demoStatusRef}
            role="status"
            aria-label="Demo-handling"
            tabIndex={-1}
            className="min-h-5 rounded-sm text-sm focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2"
            style={{ color: 'var(--color-neutral-700)' }}
          >
            {demoStatus}
          </p>
        </div>
      </section>

      {role === 'participant' ? (
        participantComplete ? (
          <main className="mx-auto w-full max-w-2xl px-4 py-12 text-center sm:px-6">
            <div className="rounded-xl border bg-white p-6" style={{ borderColor: 'var(--color-neutral-200)' }}>
              <h1
                ref={participantCompleteHeadingRef}
                tabIndex={-1}
                className="rounded-sm text-2xl font-bold focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2"
                style={{ color: 'var(--color-navy-900)' }}
              >
                Demo-svarene er registrert lokalt
              </h1>
              <p className="mt-2 text-sm" style={{ color: 'var(--color-neutral-700)' }}>
                Ingen svar ble sendt eller lagret.
              </p>
              <button
                type="button"
                onClick={resetParticipant}
                className={`${actionClassName} mt-5 text-white`}
                style={{ background: 'var(--color-red-600)' }}
              >
                Start deltaker-demo på nytt
              </button>
            </div>
          </main>
        ) : (
          <HealthCheckResponseFlow
            key={participantAttempt}
            participantName="Demo-deltaker"
            submitting={participantSubmitting}
            submitError={null}
            onSubmit={handleParticipantSubmit}
            onLeave={resetParticipant}
            confirmDiscard={() => true}
          />
        )
      ) : (
        <HealthCheckFacilitatorDashboard
          squadName="Demo-teamet"
          progressRows={progressRows}
          actionLoading={false}
          error={null}
          deliveryStatus={deliveryStatus}
          readyDescription="Prototype-CSV-en opprettes lokalt fra syntetiske demodata og blir liggende på enheten."
          readyContent={<PrototypeResultPanel />}
          onRemoveInProgress={(memberId) => {
            setProgressRows((rows) => rows.filter((row) => row.memberId !== memberId));
            setDemoStatus('Demo: Deltakeren ble fjernet lokalt.');
          }}
          onFinalize={() => {
            setDeliveryStatus('awaiting_materialization');
            setDemoStatus('Demo: Helsesjekken er fullført lokalt.');
          }}
          onAbort={resetFacilitator}
          onDownload={handleDownload}
          confirmRemove={() => true}
          confirmAbort={() => true}
          confirmFinalize={() => true}
        />
      )}
    </div>
  );
}
