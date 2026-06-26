import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChunkErrorBoundary } from '../../components/ChunkErrorBoundary';

// ── Hjelpere ────────────────────────────────────────────────────────────────────

function ThrowingChild({ error }: { error: Error }): never {
  throw error;
}

function HealthyChild() {
  return <div>Frisk barn</div>;
}

/** Undertrykk React-feil i konsoll for forventede throws i tester */
function suppressConsoleError() {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => spy.mockRestore();
}

// ── window.location.reload mock ───────────────────────────────────────────────

let reloadSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reloadSpy = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, reload: reloadSpy },
  });
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

// ── Tester ────────────────────────────────────────────────────────────────────

describe('ChunkErrorBoundary – frisk tilstand', () => {
  it('rendrer children uten feil', () => {
    render(
      <ChunkErrorBoundary>
        <HealthyChild />
      </ChunkErrorBoundary>,
    );

    expect(screen.getByText('Frisk barn')).toBeInTheDocument();
  });
});

describe('ChunkErrorBoundary – chunk-feil utløser reload', () => {
  it('kaller window.location.reload() ved "Failed to fetch dynamically imported module"', () => {
    const restore = suppressConsoleError();
    const chunkError = new Error('Failed to fetch dynamically imported module');

    render(
      <ChunkErrorBoundary>
        <ThrowingChild error={chunkError} />
      </ChunkErrorBoundary>,
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    restore();
  });

  it('kaller window.location.reload() ved "Loading chunk" feil', () => {
    const restore = suppressConsoleError();
    const chunkError = new Error('Loading chunk 3 failed');

    render(
      <ChunkErrorBoundary>
        <ThrowingChild error={chunkError} />
      </ChunkErrorBoundary>,
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    restore();
  });

  it('kaller window.location.reload() ved "Loading CSS chunk" feil', () => {
    const restore = suppressConsoleError();
    const chunkError = new Error('Loading CSS chunk 5 failed');

    render(
      <ChunkErrorBoundary>
        <ThrowingChild error={chunkError} />
      </ChunkErrorBoundary>,
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    restore();
  });

  it('kaller window.location.reload() ved ChunkLoadError (error.name)', () => {
    const restore = suppressConsoleError();
    const chunkError = new Error('Unexpected token');
    chunkError.name = 'ChunkLoadError';

    render(
      <ChunkErrorBoundary>
        <ThrowingChild error={chunkError} />
      </ChunkErrorBoundary>,
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    restore();
  });

  it('viser "Oppdaterer appen…" mens reload skjer', () => {
    const restore = suppressConsoleError();
    const chunkError = new Error('Failed to fetch dynamically imported module');

    render(
      <ChunkErrorBoundary>
        <ThrowingChild error={chunkError} />
      </ChunkErrorBoundary>,
    );

    expect(screen.getByText('Oppdaterer appen…')).toBeInTheDocument();
    restore();
  });
});

describe('ChunkErrorBoundary – ikke-chunk-feil', () => {
  it('kaller IKKE reload() ved generell JavaScript-feil', () => {
    const restore = suppressConsoleError();
    const genericError = new Error('Cannot read properties of undefined');

    render(
      <ChunkErrorBoundary>
        <ThrowingChild error={genericError} />
      </ChunkErrorBoundary>,
    );

    expect(reloadSpy).not.toHaveBeenCalled();
    restore();
  });

  it('viser fallback-UI (Oppdaterer appen…) selv for generell feil', () => {
    const restore = suppressConsoleError();
    const genericError = new Error('Noe gikk galt');

    render(
      <ChunkErrorBoundary>
        <ThrowingChild error={genericError} />
      </ChunkErrorBoundary>,
    );

    // hasError = true → fallback vises, men ingen reload
    expect(screen.getByText('Oppdaterer appen…')).toBeInTheDocument();
    expect(reloadSpy).not.toHaveBeenCalled();
    restore();
  });
});
