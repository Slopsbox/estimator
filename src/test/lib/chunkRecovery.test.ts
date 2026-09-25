import { describe, expect, it, vi } from 'vitest';
import {
  isChunkLoadError,
  recoverFromChunkLoad,
  type ChunkRecoveryEnvironment,
} from '../../lib/chunkRecovery';

function createEnvironment(storage: ChunkRecoveryEnvironment['storage'] = null) {
  let currentUrl = 'https://estimat.no/health-check/respond?room=ABC';
  const reload = vi.fn();
  const environment: ChunkRecoveryEnvironment = {
    buildId: 'build-123',
    storage,
    getCurrentUrl: () => currentUrl,
    replaceUrl: (url) => {
      currentUrl = url;
    },
    reload,
  };

  return { environment, reload, getCurrentUrl: () => currentUrl };
}

describe('isChunkLoadError', () => {
  it.each([
    new TypeError('Failed to fetch dynamically imported module: https://estimat.no/assets/Vote-a1b2.js'),
    Object.assign(new Error('Loading chunk 7 failed'), { name: 'ChunkLoadError' }),
    new Error('Loading CSS chunk 4 failed'),
    new Error('Unable to preload CSS for /assets/app-a1b2.css'),
  ])('gjenkjenner kjente chunk-lastfeil', (error) => {
    expect(isChunkLoadError(error)).toBe(true);
  });

  it.each([
    new Error('Network request failed'),
    new Error('Cannot read properties of undefined'),
    new TypeError('Failed to fetch'),
    'Failed to fetch dynamically imported module',
  ])('avviser andre feil', (error) => {
    expect(isChunkLoadError(error)).toBe(false);
  });
});

describe('recoverFromChunkLoad', () => {
  it('reloader høyst én gang for samme build og modul når sessionStorage er blokkert', () => {
    const blockedStorage = {
      getItem: vi.fn(() => {
        throw new DOMException('Blocked', 'SecurityError');
      }),
      setItem: vi.fn(() => {
        throw new DOMException('Blocked', 'SecurityError');
      }),
    };
    const { environment, reload, getCurrentUrl } = createEnvironment(blockedStorage);
    const error = new TypeError(
      'Failed to fetch dynamically imported module: https://estimat.no/assets/Vote-a1b2.js',
    );

    expect(recoverFromChunkLoad(error, environment)).toBe('reloading');
    expect(recoverFromChunkLoad(error, environment)).toBe('already-retried');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(getCurrentUrl()).toContain('__chunk_retry=');
    expect(getCurrentUrl()).toContain('room=ABC');
  });

  it('sporer ulike feilede moduler hver for seg', () => {
    const { environment, reload } = createEnvironment();

    expect(recoverFromChunkLoad(
      new Error('Loading chunk 1 failed (/assets/Vote-a1b2.js)'),
      environment,
    )).toBe('reloading');
    expect(recoverFromChunkLoad(
      new Error('Loading chunk 2 failed (/assets/Dashboard-c3d4.js)'),
      environment,
    )).toBe('reloading');
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('tillater samme feil én gang igjen i en ny build', () => {
    const { environment, reload } = createEnvironment();
    const error = new Error('Loading chunk 1 failed (/assets/Vote-a1b2.js)');

    expect(recoverFromChunkLoad(error, environment)).toBe('reloading');
    environment.buildId = 'build-124';
    expect(recoverFromChunkLoad(error, environment)).toBe('reloading');
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('beholder tidligere retry-markører når storage er blokkert', () => {
    const { environment, reload } = createEnvironment({
      getItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
    const voteError = new Error('Loading chunk 1 failed (/assets/Vote-a1b2.js)');
    const dashboardError = new Error('Loading chunk 2 failed (/assets/Dashboard-c3d4.js)');

    expect(recoverFromChunkLoad(voteError, environment)).toBe('reloading');
    expect(recoverFromChunkLoad(dashboardError, environment)).toBe('reloading');
    expect(recoverFromChunkLoad(voteError, environment)).toBe('already-retried');
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('reloader aldri en generell feil', () => {
    const { environment, reload } = createEnvironment();

    expect(recoverFromChunkLoad(new Error('Noe gikk galt'), environment)).toBe('not-chunk-error');
    expect(reload).not.toHaveBeenCalled();
  });

  it('unngår reload-loop når ingen varig retry-markør kan lagres', () => {
    const { environment, reload } = createEnvironment({
      getItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
    environment.replaceUrl = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };

    expect(recoverFromChunkLoad(
      new Error('Loading chunk 1 failed (/assets/Vote-a1b2.js)'),
      environment,
    )).toBe('already-retried');
    expect(reload).not.toHaveBeenCalled();
  });
});
