import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChunkErrorBoundary } from '../../components/ChunkErrorBoundary';

function ThrowingChild({ error }: { error: Error }): never {
  throw error;
}

function HealthyChild() {
  return <div>Friskt innhold</div>;
}

let reloadSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reloadSpy = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...window.location, reload: reloadSpy },
  });
  window.history.replaceState({}, '', '/');
  sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('ChunkErrorBoundary', () => {
  it('rendrer children når ingen feil oppstår', () => {
    render(
      <ChunkErrorBoundary>
        <HealthyChild />
      </ChunkErrorBoundary>,
    );

    expect(screen.getByText('Friskt innhold')).toBeInTheDocument();
  });

  it('laster siden på nytt én gang ved en gjenkjent chunk-feil', () => {
    const chunkError = new TypeError(
      'Failed to fetch dynamically imported module: https://estimat.no/assets/Vote-deadbeef.js',
    );

    const firstRender = render(
      <ChunkErrorBoundary>
        <ThrowingChild error={chunkError} />
      </ChunkErrorBoundary>,
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Laster siste versjon av appen...')).toBeInTheDocument();

    firstRender.unmount();
    render(
      <ChunkErrorBoundary>
        <ThrowingChild error={chunkError} />
      </ChunkErrorBoundary>,
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Appen kunne ikke lastes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Last siden på nytt' })).toBeInTheDocument();
  });

  it('viser en ærlig fallback uten automatisk reload ved en generell render-feil', () => {
    render(
      <ChunkErrorBoundary>
        <ThrowingChild error={new Error('Cannot read properties of undefined')} />
      </ChunkErrorBoundary>,
    );

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Noe gikk galt' })).toBeInTheDocument();
    expect(screen.getByText(/uventet feil/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prøv på nytt' })).toBeInTheDocument();
  });
});
