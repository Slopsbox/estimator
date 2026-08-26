import type { HealthCheckDownloadGateway } from './healthCheckGateway';
import type { HealthCheckFailureReason } from './types';
import { isSafeHealthReportFilename } from './parsers';

const DOWNLOAD_ENDPOINT = '/api/health-check-download';
const FALLBACK_FILENAME = 'health-check-report.zip';
const MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024;
const MAX_AUTHORIZATION_HEADER_BYTES = 4096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface HealthCheckDownloadAuthPort {
  getAccessToken(): Promise<string | null>;
}

export interface HealthCheckDownloadAnchorPort {
  href: string;
  download: string;
  rel: string;
  hidden: boolean;
  click(): void;
  remove(): void;
}

export interface HealthCheckDownloadUrlPort {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface HealthCheckDownloadDependencies {
  readonly auth: HealthCheckDownloadAuthPort;
  readonly fetch: (input: string, init: RequestInit) => Promise<Response>;
  readonly createAnchor: () => HealthCheckDownloadAnchorPort;
  readonly appendAnchor: (anchor: HealthCheckDownloadAnchorPort) => void;
  readonly url: HealthCheckDownloadUrlPort;
  readonly scheduleCleanup: (callback: () => void) => void;
}

interface SupabaseClientLike {
  readonly auth: {
    getSession(): Promise<{
      readonly data: { readonly session: { readonly access_token: unknown } | null };
      readonly error: unknown | null;
    }>;
  };
}

export type SupabaseHealthCheckDownloadDependencies = Omit<
  HealthCheckDownloadDependencies,
  'auth'
> & {
  readonly supabase: SupabaseClientLike;
};

export function createSupabaseHealthCheckDownloadGateway({
  supabase,
  ...dependencies
}: SupabaseHealthCheckDownloadDependencies): HealthCheckDownloadGateway {
  return createHealthCheckDownloadGateway({
    ...dependencies,
    auth: {
      async getAccessToken() {
        const { data, error } = await supabase.auth.getSession();
        if (error !== null || typeof data.session?.access_token !== 'string') return null;
        return data.session.access_token;
      },
    },
  });
}

export function createHealthCheckDownloadGateway({
  auth,
  fetch,
  createAnchor,
  appendAnchor,
  url,
  scheduleCleanup,
}: HealthCheckDownloadDependencies): HealthCheckDownloadGateway {
  return {
    async requestDownload(jobId) {
      if (!UUID_PATTERN.test(jobId)) return { ok: false, reason: 'domain_conflict' };

      let token: string | null;
      try {
        token = await auth.getAccessToken();
      } catch {
        return { ok: false, reason: 'identity' };
      }
      if (!isValidAccessToken(token)) return { ok: false, reason: 'identity' };

      let response: Response;
      try {
        response = await fetch(DOWNLOAD_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ jobId }),
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
        });
      } catch {
        return { ok: false, reason: 'rpc' };
      }

      if (!response.ok) {
        cancelResponseBody(response);
        return { ok: false, reason: classifyStatus(response.status) };
      }
      if (!isZipContentType(response.headers.get('content-type'))) {
        cancelResponseBody(response);
        return { ok: false, reason: 'malformed' };
      }
      const contentLength = parseContentLength(response.headers.get('content-length'));
      if (contentLength === undefined) {
        cancelResponseBody(response);
        return { ok: false, reason: 'malformed' };
      }

      const body = await readBoundedBody(response.body, contentLength);
      if (!body.ok) return { ok: false, reason: body.reason };
      if (!hasZipMagic(body.bytes)) {
        return { ok: false, reason: 'malformed' };
      }

      const filename = parseDownloadFilename(response.headers.get('content-disposition'))
        ?? FALLBACK_FILENAME;
      const blob = new Blob([body.bytes], { type: 'application/zip' });
      let objectUrl: string;
      try {
        objectUrl = url.createObjectURL(blob);
      } catch {
        return { ok: false, reason: 'rpc' };
      }

      let anchor: HealthCheckDownloadAnchorPort | null = null;
      try {
        anchor = createAnchor();
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.rel = 'noopener';
        anchor.hidden = true;
        appendAnchor(anchor);
        anchor.click();
      } catch {
        removeAnchor(anchor);
        revokeObjectUrl(url, objectUrl);
        return { ok: false, reason: 'rpc' };
      }

      removeAnchor(anchor);
      try {
        scheduleCleanup(() => revokeObjectUrl(url, objectUrl));
      } catch {
        revokeObjectUrl(url, objectUrl);
      }
      return { ok: true, value: undefined };
    },
  };
}

function isValidAccessToken(value: string | null): value is string {
  if (typeof value !== 'string' || value.length === 0 || /\s/.test(value)) return false;
  return new TextEncoder().encode(`Bearer ${value}`).byteLength <= MAX_AUTHORIZATION_HEADER_BYTES;
}

function classifyStatus(status: number): HealthCheckFailureReason {
  if (status === 401) return 'identity';
  if (status === 403) return 'forbidden';
  if (status === 413) return 'malformed';
  if (status === 400 || status === 404 || status === 409 || status === 415) {
    return 'domain_conflict';
  }
  return 'rpc';
}

function isZipContentType(value: string | null): boolean {
  return value !== null
    && /^application\/zip(?:\s*;\s*[!#$%&'*+.^_`|~0-9a-z-]+=(?:[!#$%&'*+.^_`|~0-9a-z-]+|"[^"\r\n]*"))*\s*$/i.test(value);
}

function parseContentLength(value: string | null): number | null | undefined {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return undefined;
  const length = Number(value);
  return Number.isSafeInteger(length) && length <= MAX_DOWNLOAD_BYTES ? length : undefined;
}

type BodyReadResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly reason: 'malformed' | 'rpc' };

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  expectedLength: number | null,
): Promise<BodyReadResult> {
  if (body === null) return { ok: false, reason: 'malformed' };

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = body.getReader();
  } catch {
    return { ok: false, reason: 'rpc' };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch {
        await cancelReader(reader);
        return { ok: false, reason: 'rpc' };
      }
      if (result.done) break;
      total += result.value.byteLength;
      if (total > MAX_DOWNLOAD_BYTES || (expectedLength !== null && total > expectedLength)) {
        await cancelReader(reader);
        return { ok: false, reason: 'malformed' };
      }
      chunks.push(result.value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A broken stream must not escape the gateway boundary.
    }
  }

  if (expectedLength !== null && total !== expectedLength) {
    return { ok: false, reason: 'malformed' };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // The original read/validation result remains authoritative.
  }
}

function cancelResponseBody(response: Response): void {
  try {
    void response.body?.cancel().catch(() => undefined);
  } catch {
    // Rejection classification remains authoritative.
  }
}

function removeAnchor(anchor: HealthCheckDownloadAnchorPort | null): void {
  try {
    anchor?.remove();
  } catch {
    // Cleanup must not replace the download outcome.
  }
}

function revokeObjectUrl(url: HealthCheckDownloadUrlPort, objectUrl: string): void {
  try {
    url.revokeObjectURL(objectUrl);
  } catch {
    // Cleanup must not replace the download outcome.
  }
}

function hasZipMagic(value: Uint8Array): boolean {
  return value.byteLength >= 4
    && value[0] === 0x50
    && value[1] === 0x4b
    && value[2] === 0x03
    && value[3] === 0x04;
}

function parseDownloadFilename(contentDisposition: string | null): string | null {
  if (contentDisposition === null) return null;
  const parameters = contentDisposition
    .split(';')
    .map((part) => part.trim())
    .filter((part) => /^filename\*/i.test(part));
  if (parameters.length !== 1) return null;

  const match = /^filename\*\s*=\s*UTF-8''([A-Za-z0-9!#$&+.^_`|~%-]*)$/i.exec(parameters[0]);
  if (!match) return null;
  try {
    const filename = decodeURIComponent(match[1]);
    return isSafeHealthReportFilename(filename) ? filename : null;
  } catch {
    return null;
  }
}
