declare const __APP_BUILD_ID__: string;

const APP_BUILD_ID = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : 'development';

const RETRY_PARAM = '__chunk_retry';
const STORAGE_PREFIX = 'estimat:chunk-retry:';
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module(?::|\s|$)/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Loading (?:CSS )?chunk [^ ]+ failed/i,
  /Unable to preload CSS for /i,
];

interface RetryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ChunkRecoveryEnvironment {
  buildId: string;
  storage: RetryStorage | null;
  getCurrentUrl: () => string;
  replaceUrl: (url: string) => void;
  reload: () => void;
}

export type ChunkRecoveryResult = 'not-chunk-error' | 'reloading' | 'already-retried';

export function isChunkLoadError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(error.message));
}

function failureKey(error: Error) {
  const asset = error.message.match(/(?:https?:\/\/[^\s)]+|\/assets\/[^\s)]+)/i)?.[0];
  return `${error.name}:${asset ?? error.message}`;
}

function hashKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function recoverFromChunkLoad(
  error: unknown,
  environment: ChunkRecoveryEnvironment,
): ChunkRecoveryResult {
  if (!isChunkLoadError(error)) return 'not-chunk-error';

  const retryId = hashKey(`${environment.buildId}:${failureKey(error)}`);
  const storageKey = `${STORAGE_PREFIX}${retryId}`;
  const currentUrl = new URL(environment.getCurrentUrl());

  try {
    if (environment.storage?.getItem(storageKey) === '1') return 'already-retried';
  } catch {
    // The URL marker below remains available when browser storage is blocked.
  }

  const urlRetries = currentUrl.searchParams.get(RETRY_PARAM)?.split('.') ?? [];
  if (urlRetries.includes(retryId)) return 'already-retried';

  let retryRecorded = false;
  try {
    environment.storage?.setItem(storageKey, '1');
    retryRecorded = environment.storage?.getItem(storageKey) === '1';
  } catch {
    // Fall through to the URL marker.
  }

  if (!retryRecorded) {
    currentUrl.searchParams.set(RETRY_PARAM, [...urlRetries, retryId].join('.'));
    try {
      environment.replaceUrl(currentUrl.toString());
      retryRecorded = true;
    } catch {
      return 'already-retried';
    }
  }

  environment.reload();
  return 'reloading';
}

export function recoverChunkLoadInBrowser(error: unknown): ChunkRecoveryResult {
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // Some privacy modes deny access to sessionStorage itself.
  }

  return recoverFromChunkLoad(error, {
    buildId: APP_BUILD_ID,
    storage,
    getCurrentUrl: () => window.location.href,
    replaceUrl: (url) => window.history.replaceState(window.history.state, '', url),
    reload: () => window.location.reload(),
  });
}
