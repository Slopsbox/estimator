// @vitest-environment node

import { createCipheriv } from 'node:crypto';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, getUserMock, rpcMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import adapter from './health-check-download';

const JOB_ID = 'a1000000-0000-4000-8000-000000000001';
const ROOM_ID = 'b2000000-0000-4000-8000-000000000002';
const USER_ID = 'c3000000-0000-4000-8000-000000000003';
const TOKEN = 'header.payload.signature';
const KEY_VERSION = 7;
const KEY = Buffer.alloc(32, 0xff);
const KEY_BASE64 = KEY.toString('base64');
const NONCE = Buffer.from('000102030405060708090a0b', 'hex');
const JSON_BODY = Buffer.from(JSON.stringify({ jobId: JOB_ID }));
const ZIP_BYTES = Buffer.from(
  '504b0304140000000000000000000000000000000000000000000b0000007265706f72742e6a736f6e' +
  '504b01021400140000000000000000000000000000000000000000000b0000000000000000000000000000000000' +
  '7265706f72742e6a736f6e504b0506000000000100010039000000290000000000',
  'hex',
);

const ENV_NAMES = [
  'ENABLE_HEALTH_REPORT_DOWNLOAD',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];
const originalEnvironment = new Map(
  Object.entries(process.env).filter(([name]) =>
    ENV_NAMES.includes(name) || /^HEALTH_REPORT_AES_KEY_V[1-9][0-9]*$/.test(name)),
);

function clearTestEnvironment() {
  for (const name of Object.keys(process.env)) {
    if (ENV_NAMES.includes(name) || /^HEALTH_REPORT_AES_KEY_V[1-9][0-9]*$/.test(name)) {
      delete process.env[name];
    }
  }
}

function setValidEnvironment() {
  process.env.ENABLE_HEALTH_REPORT_DOWNLOAD = 'true';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env[`HEALTH_REPORT_AES_KEY_V${KEY_VERSION}`] = KEY_BASE64;
}

function encryptedPackage() {
  const aad = [
    'health-check-package-v1',
    `job_id=${JOB_ID}`,
    `aad_room_id=${ROOM_ID}`,
    'field=encrypted_package',
    `key_version=${KEY_VERSION}`,
  ].join('\n');
  const cipher = createCipheriv('aes-256-gcm', KEY, NONCE);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(ZIP_BYTES), cipher.final(), cipher.getAuthTag()]);

  return {
    encrypted_package: `\\x${encrypted.toString('hex')}`,
    package_nonce: `\\x${NONCE.toString('hex')}`,
    encryption_key_version: KEY_VERSION,
    sanitized_filename: 'Team East 2026.zip',
    aad_room_id: ROOM_ID,
  };
}

function request({
  method = 'POST',
  headers = {
    authorization: `Bearer ${TOKEN}`,
    'content-type': 'application/json; charset=utf-8',
  },
  body = JSON_BODY,
}: {
  method?: string;
  headers?: RequestInit['headers'];
  body?: RequestInit['body'];
} = {}): Request {
  return new Request('https://example.test/api/health-check-download', {
    method,
    headers,
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

function chunkedBody(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[index]);
      index += 1;
    },
  }, { highWaterMark: 0 });
}

async function expectGenericError(
  response: Response,
  status: number,
  error: string,
  extraHeaders: Record<string, string> = {},
) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error });
  expect(Object.fromEntries(response.headers.entries())).toEqual({
    'cache-control': 'no-store, private',
    'content-type': 'application/json',
    pragma: 'no-cache',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  clearTestEnvironment();
  createClientMock.mockImplementation((_url: string, key: string) => {
    if (key === 'anon-key') return { auth: { getUser: getUserMock } };
    if (key === 'service-role-key') return { rpc: rpcMock };
    throw new Error('Unexpected Supabase key');
  });
});

afterEach(() => {
  clearTestEnvironment();
  for (const [name, value] of originalEnvironment) process.env[name] = value;
  vi.resetAllMocks();
});

describe('health-check-download Web adapter', () => {
  it.each([undefined, 'false'])('returns a generic 404 before Supabase initialization when the feature gate is %s', async (gate) => {
    if (gate !== undefined) process.env.ENABLE_HEALTH_REPORT_DOWNLOAD = gate;

    const response = await adapter.fetch(request());

    await expectGenericError(response, 404, 'Not found');
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('returns 405 with Allow: POST without consuming an erroring body stream', async () => {
    setValidEnvironment();
    let bodyPulled = false;
    const body = new ReadableStream<Uint8Array>({
      pull() {
        bodyPulled = true;
        throw new Error('The non-POST body must not be consumed');
      },
    }, { highWaterMark: 0 });

    const response = await adapter.fetch(request({ method: 'PUT', body }));

    await expectGenericError(response, 405, 'Method not allowed', { allow: 'POST' });
    expect(bodyPulled).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('returns the exact decrypted ZIP bytes and headers after authenticating and calling the RPC', async () => {
    setValidEnvironment();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    rpcMock.mockResolvedValue({ data: [encryptedPackage()], error: null });

    const response = await adapter.fetch(request());

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(ZIP_BYTES);
    expect(Object.fromEntries(response.headers.entries())).toEqual({
      'cache-control': 'no-store, private',
      'content-disposition':
        "attachment; filename=\"health-check-report.zip\"; filename*=UTF-8''Team%20East%202026.zip",
      'content-type': 'application/zip',
      pragma: 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    expect(getUserMock).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(rpcMock).toHaveBeenCalledExactlyOnceWith(
      'get_health_check_download_package_for_service',
      { p_job_id: JOB_ID, p_user_id: USER_ID },
    );
  });

  it('accepts JSON split across ReadableStream chunks', async () => {
    setValidEnvironment();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    rpcMock.mockResolvedValue({ data: [encryptedPackage()], error: null });
    const body = chunkedBody([
      JSON_BODY.subarray(0, 7),
      JSON_BODY.subarray(7, 29),
      JSON_BODY.subarray(29),
    ]);

    const response = await adapter.fetch(request({
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'transfer-encoding': 'chunked',
      },
      body,
    }));

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(ZIP_BYTES);
    expect(getUserMock).toHaveBeenCalledExactlyOnceWith(TOKEN);
  });

  it('returns 413 before pulling the body or initializing Supabase when content-length exceeds 1024', async () => {
    setValidEnvironment();
    let bodyPulled = false;
    const body = new ReadableStream<Uint8Array>({
      pull() {
        bodyPulled = true;
        throw new Error('Oversized content-length must be rejected before body pull');
      },
    }, { highWaterMark: 0 });

    const response = await adapter.fetch(request({
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'content-length': '1025',
      },
      body,
    }));

    await expectGenericError(response, 413, 'Payload too large');
    expect(bodyPulled).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('cancels a streamed body over 1024 bytes and returns 413 before Supabase initialization', async () => {
    setValidEnvironment();
    let bodyCancelled = false;
    let chunkSent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunkSent) return;
        chunkSent = true;
        controller.enqueue(new Uint8Array(1025));
      },
      cancel() {
        bodyCancelled = true;
      },
    }, { highWaterMark: 0 });

    const response = await adapter.fetch(request({ body }));

    await expectGenericError(response, 413, 'Payload too large');
    expect(bodyCancelled).toBe(true);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('returns a generic 413 before Supabase initialization for a content-length mismatch', async () => {
    setValidEnvironment();

    const response = await adapter.fetch(request({
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'content-length': String(JSON_BODY.length + 1),
      },
      body: chunkedBody([JSON_BODY]),
    }));

    await expectGenericError(response, 413, 'Payload too large');
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('returns a generic 413 without pulling the body when content-length and transfer-encoding coexist', async () => {
    setValidEnvironment();
    let bodyPulled = false;
    const body = new ReadableStream<Uint8Array>({
      pull() {
        bodyPulled = true;
        throw new Error('Ambiguous body framing must be rejected before body pull');
      },
    }, { highWaterMark: 0 });

    const response = await adapter.fetch(request({
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'content-length': String(JSON_BODY.length),
        'transfer-encoding': 'chunked',
      },
      body,
    }));

    await expectGenericError(response, 413, 'Payload too large');
    expect(bodyPulled).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('returns 401 for comma-combined duplicate Authorization values before getUser', async () => {
    setValidEnvironment();
    const headers = new Headers([
      ['Authorization', `Bearer ${TOKEN}`],
      ['authorization', 'Bearer second.token'],
      ['Content-Type', 'application/json'],
    ]);
    const webRequest = request({ headers });
    expect(webRequest.headers.get('authorization')).toBe(
      `Bearer ${TOKEN}, Bearer second.token`,
    );

    const response = await adapter.fetch(webRequest);

    await expectGenericError(response, 401, 'Unauthorized');
    expect(getUserMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns 415 for comma-combined duplicate content-type values', async () => {
    setValidEnvironment();
    const headers = new Headers([
      ['Authorization', `Bearer ${TOKEN}`],
      ['Content-Type', 'application/json'],
      ['content-type', 'text/plain'],
    ]);
    const webRequest = request({ headers });
    expect(webRequest.headers.get('content-type')).toBe('application/json, text/plain');

    const response = await adapter.fetch(webRequest);

    await expectGenericError(response, 415, 'Unsupported media type');
    expect(getUserMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns 415 when a valid JSON charset is followed by a combined duplicate content type', async () => {
    setValidEnvironment();
    const headers = new Headers([
      ['Authorization', `Bearer ${TOKEN}`],
      ['Content-Type', 'application/json; charset=utf-8'],
      ['content-type', 'text/plain'],
    ]);

    const response = await adapter.fetch(request({ headers }));

    await expectGenericError(response, 415, 'Unsupported media type');
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('returns a detail-free 500 when required environment is missing', async () => {
    setValidEnvironment();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await adapter.fetch(request());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('returns a detail-free 500 for an invalid encryption key', async () => {
    setValidEnvironment();
    process.env[`HEALTH_REPORT_AES_KEY_V${KEY_VERSION}`] = 'not-a-key';

    const response = await adapter.fetch(request());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain('not-a-key');
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('normalizes an auth failure to a generic 401', async () => {
    setValidEnvironment();
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: `private auth failure for ${TOKEN}` },
    });

    const response = await adapter.fetch(request());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(getUserMock).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('normalizes an RPC failure to a generic 500', async () => {
    setValidEnvironment();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: `private database failure for ${JOB_ID}` },
    });

    const response = await adapter.fetch(request());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain(JOB_ID);
    expect(rpcMock).toHaveBeenCalledExactlyOnceWith(
      'get_health_check_download_package_for_service',
      { p_job_id: JOB_ID, p_user_id: USER_ID },
    );
  });
});
