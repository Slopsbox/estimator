import { useEffect, useRef } from 'react';
import { NavyPageLayout } from '../../../components/NavyPageLayout';
import { HealthCheckCampfire } from './HealthCheckCampfire';

export function HealthCheckCompletion({ onExit, ended = false }: {
  readonly onExit: () => void;
  readonly ended?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <NavyPageLayout
      roleLabel="Deltager"
      navyContent={
        <div className="text-center">
          <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold text-white focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-white">Svarene dine er registrert.</h1>
          <p className="mt-3 text-base leading-relaxed text-white" role="status">
            {ended ? 'Helsesjekken er avsluttet. Takk for bidraget ditt.' : 'Ta en pause mens resten av squaden gjør seg ferdig.'}
          </p>
        </div>
      }
    >
      <main className="mx-auto w-full max-w-[528px] pb-10">
        <HealthCheckCampfire />
        <button type="button" onClick={onExit} className="mt-5 min-h-[52px] w-full rounded-lg bg-[var(--color-red-600)] px-5 font-bold text-white hover:bg-[var(--color-red-700)] focus-visible:ring-2 focus-visible:ring-[var(--color-navy-700)] focus-visible:ring-offset-2">Avslutt</button>
      </main>
    </NavyPageLayout>
  );
}
