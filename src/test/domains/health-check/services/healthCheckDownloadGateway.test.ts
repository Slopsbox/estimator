import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHealthCheckDownloadGateway,
  createSupabaseHealthCheckDownloadGateway,
  type HealthCheckDownloadAnchorPort,
} from '../../../../domains/health-check/services';

const JOB_ID = '30000000-0000-4000-8000-000000000003';
const TOKEN = 'header.payload.signature';
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01]);
const MAX_ZIP_BYTES = 4 * 1024 * 1024;

function zipResponse({
  bytes = ZIP_BYTES,
  headers = {},
  status = 200,
}: {
  readonly bytes?: Uint8Array;
  readonly headers?: Record<string, string>;
  readonly status?: number;
} = {}): Response {
  return new Response(bytes, {
    status,
    headers: { 'content-type': 'application/zip', ...headers },
  });
}

function createHarness(response: Response = zipResponse()) {
  const getAccessToken = vi.fn().mockResolvedValue(TOKEN);
  const fetch = vi.fn().mockResolvedValue(response);
  const click = vi.fn();
  const remove = vi.fn();
  const anchor: HealthCheckDownloadAnchorPort = {
    href: '',
    download: '',
    rel: '',
    hidden: false,
    click,
    remove,
  };
  const createAnchor = vi.fn(() => anchor);
  const appendAnchor = vi.fn();
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:health-report');
  const revokeObjectURL = vi.fn();
  const scheduledCleanups: Array<() => void> = [];
  const scheduleCleanup = vi.fn((callback: () => void) => {
    scheduledCleanups.push(callback);
  });
  const gateway = createHealthCheckDownloadGateway({
    auth: { getAccessToken },
    fetch,
    createAnchor,
    appendAnchor,
    url: { createObjectURL, revokeObjectURL },
    scheduleCleanup,
  });

  return {
    gateway,
    getAccessToken,
    fetch,
    anchor,
    click,
    remove,
    createAnchor,
    appendAnchor,
    createObjectURL,
    revokeObjectURL,
    scheduleCleanup,
    runScheduledCleanups() {
      for (const cleanup of scheduledCleanups.splice(0)) cleanup();
    },
  };
}

function controlledResponse({
  chunks = [],
  headers = { 'content-type': 'application/zip' },
  status = 200,
  readError,
}: {
  readonly chunks?: readonly Uint8Array[];
  readonly headers?: Record<string, string>;
  readonly status?: number;
  readonly readError?: Error;
}) {
  let index = 0;
  const read = vi.fn(async () => {
    if (readError) throw readError;
    const chunk = chunks[index];
    index += 1;
    return chunk === undefined
      ? { done: true as const, value: undefined }
      : { done: false as const, value: chunk };
  });
  const cancel = vi.fn().mockResolvedValue(undefined);
  const releaseLock = vi.fn();
  const cancelBody = vi.fn().mockResolvedValue(undefined);
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    body: {
      getReader: () => ({ read, cancel, releaseLock }),
      cancel: cancelBody,
    },
  } as unknown as Response;

  return { response, read, cancel, releaseLock, cancelBody };
}

describe('healthCheckDownloadGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts the exact authenticated request without cookie credentials or caching', async () => {
    const harness = createHarness();

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: true,
      value: undefined,
    });

    expect(harness.fetch).toHaveBeenCalledOnce();
    expect(harness.fetch).toHaveBeenCalledWith('/api/health-check-download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobId: JOB_ID }),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    });
  });

  it('downloads a validated ZIP, removes the anchor, and revokes in a scheduled macrotask', async () => {
    const harness = createHarness(zipResponse({
      headers: {
        'content-disposition': "attachment; filename=ignored.zip; filename*=UTF-8''Team%20East.zip",
      },
    }));

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toMatchObject({ ok: true });

    expect(harness.createObjectURL).toHaveBeenCalledOnce();
    const blob = harness.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBe(ZIP_BYTES.byteLength);
    expect(harness.anchor).toMatchObject({
      href: 'blob:health-report',
      download: 'Team East.zip',
      rel: 'noopener',
      hidden: true,
    });
    expect(harness.appendAnchor).toHaveBeenCalledWith(harness.anchor);
    expect(harness.click).toHaveBeenCalledOnce();
    expect(harness.remove).toHaveBeenCalledOnce();
    expect(harness.scheduleCleanup).toHaveBeenCalledOnce();
    expect(harness.revokeObjectURL).not.toHaveBeenCalled();

    harness.runScheduledCleanups();

    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:health-report');
  });

  it('decodes a valid Unicode RFC 5987 filename', async () => {
    const harness = createHarness(zipResponse({
      headers: {
        'content-disposition': "attachment; filename*=UTF-8''Team%20%C3%98st%20%E2%80%93%202026.zip",
      },
    }));

    await harness.gateway.requestDownload(JOB_ID);

    expect(harness.anchor.download).toBe('Team Øst – 2026.zip');
  });

  it.each([
    [undefined, 'missing header'],
    ['attachment; filename="server-name.zip"', 'missing filename star'],
    ["attachment; filename*=UTF-8''..%2Fsecret.zip", 'path traversal'],
    ["attachment; filename*=UTF-8''bad%0D%0Aname.zip", 'control characters'],
    ["attachment; filename*=UTF-8''safe%E2%80%AEtxt.zip", 'bidi formatting'],
    ["attachment; filename*=UTF-8''broken%ZZ.zip", 'invalid encoding'],
    ["attachment; filename*=ISO-8859-1''report.zip", 'unsupported encoding'],
    ["attachment; filename*=UTF-8''first.zip; filename*=UTF-8''second.zip", 'duplicates'],
  ])('uses a constant fallback for %s (%s)', async (contentDisposition, _description) => {
    const headers: Record<string, string> = contentDisposition === undefined
      ? {}
      : { 'content-disposition': contentDisposition };
    const harness = createHarness(zipResponse({ headers }));

    await harness.gateway.requestDownload(JOB_ID);

    expect(harness.anchor.download).toBe('health-check-report.zip');
  });

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace'],
    ['token with spaces', 'embedded whitespace'],
    ['a'.repeat(4097), 'overlong'],
  ])('returns identity for a %s access token before fetch', async (token, _description) => {
    const harness = createHarness();
    harness.getAccessToken.mockResolvedValue(token);

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'identity',
    });
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it('returns identity when token retrieval fails', async () => {
    const harness = createHarness();
    harness.getAccessToken.mockRejectedValue(new Error('private auth detail'));

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'identity',
    });
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it.each([
    'not-a-job',
    '30000000-0000-0000-0000-000000000003',
    '30000000-0000-4000-7000-000000000003',
  ])('rejects invalid job UUID %s before retrieving identity or fetching', async (jobId) => {
    const harness = createHarness();

    await expect(harness.gateway.requestDownload(jobId)).resolves.toEqual({
      ok: false,
      reason: 'domain_conflict',
    });
    expect(harness.getAccessToken).not.toHaveBeenCalled();
    expect(harness.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'domain_conflict'],
    [401, 'identity'],
    [403, 'forbidden'],
    [404, 'domain_conflict'],
    [409, 'domain_conflict'],
    [413, 'malformed'],
    [415, 'domain_conflict'],
    [500, 'rpc'],
    [503, 'rpc'],
  ] as const)('maps HTTP %s to %s without reading the error body', async (status, reason) => {
    const controlled = controlledResponse({ status });
    const harness = createHarness(controlled.response);

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason,
    });
    expect(controlled.read).not.toHaveBeenCalled();
    expect(controlled.cancelBody).toHaveBeenCalledOnce();
  });

  it.each([
    ['application/octet-stream', 'wrong type'],
    ['text/html', 'HTML'],
    ['application/zip, text/html', 'combined values'],
  ])('rejects %s as a %s content type', async (contentType) => {
    const controlled = controlledResponse({ headers: { 'content-type': contentType } });
    const harness = createHarness(controlled.response);

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(harness.createObjectURL).not.toHaveBeenCalled();
    expect(controlled.read).not.toHaveBeenCalled();
    expect(controlled.cancelBody).toHaveBeenCalledOnce();
  });

  it('accepts a case-insensitive ZIP media type with a compatible parameter', async () => {
    const harness = createHarness(zipResponse({
      headers: { 'content-type': 'Application/Zip; charset=binary' },
    }));

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toMatchObject({ ok: true });
  });

  it.each([
    [String(MAX_ZIP_BYTES + 1), 'over cap'],
    ['not-a-number', 'malformed'],
    ['10, 10', 'combined'],
  ])('rejects a %s Content-Length before reading the body (%s)', async (contentLength) => {
    const controlled = controlledResponse({
      headers: { 'content-type': 'application/zip', 'content-length': contentLength },
    });
    const harness = createHarness(controlled.response);

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(controlled.read).not.toHaveBeenCalled();
    expect(controlled.cancelBody).toHaveBeenCalledOnce();
  });

  it('accepts a bounded stream without Content-Length', async () => {
    const controlled = controlledResponse({ chunks: [ZIP_BYTES.subarray(0, 2), ZIP_BYTES.subarray(2)] });
    const harness = createHarness(controlled.response);

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toMatchObject({ ok: true });

    expect(controlled.read).toHaveBeenCalledTimes(3);
    expect(controlled.cancel).not.toHaveBeenCalled();
    expect(controlled.releaseLock).toHaveBeenCalledOnce();
  });

  it('cancels when Content-Length is lower than received bytes without pulling later chunks', async () => {
    const controlled = controlledResponse({
      chunks: [ZIP_BYTES, new Uint8Array([1])],
      headers: { 'content-type': 'application/zip', 'content-length': '4' },
    });
    const harness = createHarness(controlled.response);

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(controlled.read).toHaveBeenCalledOnce();
    expect(controlled.cancel).toHaveBeenCalledOnce();
    expect(controlled.releaseLock).toHaveBeenCalledOnce();
    expect(harness.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects Content-Length that is higher than the completed stream size', async () => {
    const controlled = controlledResponse({
      chunks: [ZIP_BYTES],
      headers: { 'content-type': 'application/zip', 'content-length': '6' },
    });
    const harness = createHarness(controlled.response);

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(controlled.cancel).not.toHaveBeenCalled();
    expect(controlled.releaseLock).toHaveBeenCalledOnce();
    expect(harness.createObjectURL).not.toHaveBeenCalled();
  });

  it('cancels an overflowing chunked stream without pulling a later chunk', async () => {
    const firstChunk = new Uint8Array(MAX_ZIP_BYTES);
    firstChunk.set(ZIP_BYTES);
    const controlled = controlledResponse({
      chunks: [firstChunk, new Uint8Array([1]), new Uint8Array([2])],
    });
    const harness = createHarness(controlled.response);

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(controlled.read).toHaveBeenCalledTimes(2);
    expect(controlled.cancel).toHaveBeenCalledOnce();
    expect(controlled.releaseLock).toHaveBeenCalledOnce();
  });

  it('cancels a stream after a read error and returns rpc', async () => {
    const controlled = controlledResponse({ readError: new Error('private stream detail') });
    const harness = createHarness(controlled.response);

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'rpc',
    });
    expect(controlled.cancel).toHaveBeenCalledOnce();
    expect(controlled.releaseLock).toHaveBeenCalledOnce();
  });

  it('rejects a successful response without a body as malformed', async () => {
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/zip' }),
      body: null,
    } as unknown as Response;
    const harness = createHarness(response);

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects an actual body larger than 4 MiB even without Content-Length', async () => {
    const oversized = new Uint8Array(MAX_ZIP_BYTES + 1);
    oversized.set(ZIP_BYTES);
    const response = zipResponse({ bytes: oversized });
    response.headers.delete('content-length');
    const harness = createHarness(response);

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(harness.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects a body without a recognized ZIP signature', async () => {
    const harness = createHarness(zipResponse({ bytes: new Uint8Array([1, 2, 3, 4]) }));

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(harness.createObjectURL).not.toHaveBeenCalled();
  });

  it('normalizes fetch failures without exposing their details', async () => {
    const harness = createHarness();
    harness.fetch.mockRejectedValue(new Error('private network detail'));

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'rpc',
    });
    expect(harness.createAnchor).not.toHaveBeenCalled();
  });

  it('removes the anchor and revokes the object URL when clicking fails', async () => {
    const harness = createHarness();
    harness.click.mockImplementation(() => {
      throw new Error('blocked click');
    });

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'rpc',
    });
    expect(harness.remove).toHaveBeenCalledOnce();
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:health-report');
    expect(harness.scheduleCleanup).not.toHaveBeenCalled();
  });

  it('revokes the object URL when anchor creation fails', async () => {
    const harness = createHarness();
    harness.createAnchor.mockImplementation(() => {
      throw new Error('DOM unavailable');
    });

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'rpc',
    });
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:health-report');
  });

  it('still succeeds and schedules revocation when removing the anchor fails after click', async () => {
    const harness = createHarness();
    harness.remove.mockImplementation(() => {
      throw new Error('remove failed');
    });

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toMatchObject({ ok: true });
    expect(harness.revokeObjectURL).not.toHaveBeenCalled();

    harness.runScheduledCleanups();

    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:health-report');
  });

  it('ignores object URL revocation failures after a successful click', async () => {
    const harness = createHarness();
    harness.revokeObjectURL.mockImplementation(() => {
      throw new Error('revoke failed');
    });

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toMatchObject({ ok: true });
    expect(harness.remove).toHaveBeenCalledOnce();

    expect(() => harness.runScheduledCleanups()).not.toThrow();
  });

  it('still succeeds and immediately revokes when scheduling cleanup fails after click', async () => {
    const harness = createHarness();
    harness.scheduleCleanup.mockImplementation(() => {
      throw new Error('scheduler unavailable');
    });

    await expect(harness.gateway.requestDownload(JOB_ID)).resolves.toMatchObject({ ok: true });
    expect(harness.remove).toHaveBeenCalledOnce();
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:health-report');
  });
});

describe('createSupabaseHealthCheckDownloadGateway', () => {
  it('reads the current access token from a Supabase client-like auth port', async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: TOKEN } },
      error: null,
    });
    const fetch = vi.fn().mockResolvedValue(zipResponse());
    const anchor: HealthCheckDownloadAnchorPort = {
      href: '', download: '', rel: '', hidden: false, click: vi.fn(), remove: vi.fn(),
    };
    const gateway = createSupabaseHealthCheckDownloadGateway({
      supabase: { auth: { getSession } },
      fetch,
      createAnchor: () => anchor,
      appendAnchor: vi.fn(),
      url: { createObjectURL: () => 'blob:report', revokeObjectURL: vi.fn() },
      scheduleCleanup: vi.fn(),
    });

    await expect(gateway.requestDownload(JOB_ID)).resolves.toMatchObject({ ok: true });
    expect(getSession).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
  });

  it.each([
    [{ data: { session: null }, error: null }, 'missing session'],
    [{ data: { session: { access_token: TOKEN } }, error: { message: 'failed' } }, 'auth error'],
    [{ data: { session: { access_token: 123 } }, error: null }, 'malformed token'],
  ])('returns identity for a Supabase %s', async (sessionResult, _description) => {
    const getSession = vi.fn().mockResolvedValue(sessionResult);
    const fetch = vi.fn();
    const gateway = createSupabaseHealthCheckDownloadGateway({
      supabase: { auth: { getSession } },
      fetch,
      createAnchor: vi.fn(),
      appendAnchor: vi.fn(),
      url: { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() },
      scheduleCleanup: vi.fn(),
    });

    await expect(gateway.requestDownload(JOB_ID)).resolves.toEqual({
      ok: false,
      reason: 'identity',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
