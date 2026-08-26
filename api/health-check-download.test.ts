// @vitest-environment node

import { createCipheriv } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_DOWNLOAD_REQUEST_BYTES,
  MAX_HEALTH_REPORT_PACKAGE_BYTES,
  buildHealthReportAad,
  createHealthCheckDownloadHandler,
  parseHealthReportKey,
} from './_lib/health-check-download';

const JOB_ID = 'a1000000-0000-4000-8000-000000000001';
const ROOM_ID = 'b2000000-0000-4000-8000-000000000002';
const USER_ID = 'c3000000-0000-4000-8000-000000000003';
const TOKEN = 'header.payload.signature';
const KEY_VERSION = 7;
const KEY = Buffer.alloc(32, 0xff);
const KEY_BASE64 = KEY.toString('base64');
const NONCE = Buffer.from('000102030405060708090a0b', 'hex');
const ZIP_BYTES = Buffer.from('504b0304140000000800a55a1a5900000000000000000000000000', 'hex');

type PackageRecord = {
  encrypted_package: string;
  package_nonce: string;
  encryption_key_version: number;
  sanitized_filename: string;
  aad_room_id: string;
};

type Request = {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body?: string | Uint8Array;
};

const bytea = (value: Uint8Array): string => `\\x${Buffer.from(value).toString('hex')}`;

function encryptPackage(
  plaintext = ZIP_BYTES,
  overrides: Partial<Pick<PackageRecord, 'encryption_key_version' | 'aad_room_id'>> = {},
): PackageRecord {
  const encryptionKeyVersion = overrides.encryption_key_version ?? KEY_VERSION;
  const aadRoomId = overrides.aad_room_id ?? ROOM_ID;
  const cipher = createCipheriv('aes-256-gcm', KEY, NONCE);
  cipher.setAAD(Buffer.from(buildHealthReportAad({
    jobId: JOB_ID,
    aadRoomId,
    keyVersion: encryptionKeyVersion,
  }), 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  return {
    encrypted_package: bytea(encrypted),
    package_nonce: bytea(NONCE),
    encryption_key_version: encryptionKeyVersion,
    sanitized_filename: 'Team Øst – 2026.zip',
    aad_room_id: aadRoomId,
  };
}

function request(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ jobId: JOB_ID }),
    ...overrides,
  };
}

function createHandler(options: {
  authenticate?: (token: string) => Promise<string | null>;
  getPackage?: (jobId: string, userId: string) => Promise<PackageRecord | null>;
  encryptionKeys?: ReadonlyMap<number, string>;
} = {}) {
  return createHealthCheckDownloadHandler({
    authenticate: options.authenticate ?? (async () => USER_ID),
    getPackage: options.getPackage ?? (async () => encryptPackage()),
    encryptionKeys: options.encryptionKeys ?? new Map([[KEY_VERSION, KEY_BASE64]]),
  });
}

function expectError(
  response: { status: number; headers: Record<string, string>; body: unknown },
  status: number,
  error: string,
) {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({ error });
  expect(response.headers['cache-control']).toContain('no-store');
  expect(JSON.stringify(response.body)).not.toMatch(
    /header\.payload|a1000000|Team Øst|private|database|cipher|auth failure/i,
  );
}

describe('buildHealthReportAad', () => {
  it('builds the exact canonical UTF-8 text with lowercase UUIDs and no trailing newline', () => {
    const aad = buildHealthReportAad({
      jobId: JOB_ID.toUpperCase(),
      aadRoomId: ROOM_ID.toUpperCase(),
      keyVersion: KEY_VERSION,
    });

    expect(aad).toBe(
      'health-check-package-v1\n' +
      `job_id=${JOB_ID}\n` +
      `aad_room_id=${ROOM_ID}\n` +
      'field=encrypted_package\n' +
      `key_version=${KEY_VERSION}`,
    );
    expect(Buffer.from(aad, 'utf8').at(-1)).not.toBe(0x0a);
  });
});

describe('parseHealthReportKey', () => {
  it('parses an exactly canonical base64-encoded 32-byte key', () => {
    expect(Buffer.from(parseHealthReportKey(KEY_BASE64))).toEqual(KEY);
  });

  it.each([
    ['invalid alphabet', KEY_BASE64.replace('/', '*')],
    ['surrounding whitespace', ` ${KEY_BASE64}`],
    ['trailing newline', `${KEY_BASE64}\n`],
    ['URL-safe alphabet', KEY_BASE64.replaceAll('/', '_').replace(/=$/, '')],
    ['missing padding', KEY_BASE64.slice(0, -1)],
    ['noncanonical pad bits', `${KEY_BASE64.slice(0, -2)}9=`],
    ['31 decoded bytes', Buffer.alloc(31).toString('base64')],
    ['33 decoded bytes', Buffer.alloc(33).toString('base64')],
    ['empty input', ''],
  ])('rejects %s', (_case, value) => {
    expect(() => parseHealthReportKey(value)).toThrow();
  });
});

describe('createHealthCheckDownloadHandler', () => {
  it('defines the decrypted package cap as exactly 4 MiB', () => {
    expect(MAX_HEALTH_REPORT_PACKAGE_BYTES).toBe(4 * 1024 * 1024);
  });

  it('decrypts a real AES-256-GCM envelope and returns the exact ZIP bytes and download headers', async () => {
    const authenticate = vi.fn(async () => USER_ID);
    const getPackage = vi.fn(async () => encryptPackage());
    const handler = createHandler({ authenticate, getPackage });

    const response = await handler(request());

    expect(response.status).toBe(200);
    expect(Buffer.from(response.body as Uint8Array)).toEqual(ZIP_BYTES);
    expect(response.headers).toMatchObject({
      'content-type': 'application/zip',
      'cache-control': 'no-store, private',
      pragma: 'no-cache',
      'x-content-type-options': 'nosniff',
      'content-disposition':
        "attachment; filename=\"health-check-report.zip\"; filename*=UTF-8''Team%20%C3%98st%20%E2%80%93%202026.zip",
    });
    expect(authenticate).toHaveBeenCalledWith(TOKEN);
    expect(getPackage).toHaveBeenCalledWith(JOB_ID, USER_ID);
  });

  it('returns identical bytes when the same immutable package is downloaded repeatedly', async () => {
    const storedPackage = encryptPackage();
    const handler = createHandler({ getPackage: async () => storedPackage });

    const first = await handler(request());
    const second = await handler(request());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(Buffer.from(first.body as Uint8Array)).toEqual(ZIP_BYTES);
    expect(Buffer.from(second.body as Uint8Array)).toEqual(Buffer.from(first.body as Uint8Array));
  });

  it('returns 405 with Allow: POST for every other method', async () => {
    const response = await createHandler()(request({ method: 'GET', headers: {} }));

    expectError(response, 405, 'Method not allowed');
    expect(response.headers.allow).toBe('POST');
  });

  it.each([
    [undefined],
    ['text/plain'],
    ['application/x-www-form-urlencoded'],
    ['application/jsonp'],
    ['application/json; charset=utf-8, text/plain'],
    ['application/json; boundary=invalid'],
  ])('returns 415 for unsupported content type %s', async (contentType) => {
    const response = await createHandler()(request({
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': contentType,
      },
    }));

    expectError(response, 415, 'Unsupported media type');
  });

  it.each([
    ['invalid JSON', '{'],
    ['null', 'null'],
    ['array', JSON.stringify([{ jobId: JOB_ID }])],
    ['missing jobId', JSON.stringify({})],
    ['non-string jobId', JSON.stringify({ jobId: 42 })],
    ['extra key', JSON.stringify({ jobId: JOB_ID, token: TOKEN })],
  ])('returns 400 for a body with %s', async (_case, body) => {
    const response = await createHandler()(request({ body }));

    expectError(response, 400, 'Invalid request');
  });

  it('returns 413 before parsing a request body over the explicit cap', async () => {
    const body = new Uint8Array(MAX_DOWNLOAD_REQUEST_BYTES + 1);
    const response = await createHandler()(request({ body }));

    expectError(response, 413, 'Payload too large');
  });

  it.each([
    'not-a-uuid',
    'a1000000-0000-4000-8000-00000000000',
    'a1000000-0000-4000-7000-000000000001',
    'a1000000-0000-0000-8000-000000000001',
  ])('returns 400 for invalid job UUID %s', async (jobId) => {
    const response = await createHandler()(request({ body: JSON.stringify({ jobId }) }));

    expectError(response, 400, 'Invalid request');
  });

  it.each([
    ['missing', undefined],
    ['wrong scheme', 'Basic abc'],
    ['empty bearer', 'Bearer '],
    ['multiple credentials', ['Bearer first', 'Bearer second']],
    ['embedded whitespace', 'Bearer header.payload.signature extra'],
    ['oversized', `Bearer ${'a'.repeat(8_192)}`],
  ])('returns 401 for %s authorization', async (_case, authorization) => {
    const response = await createHandler()(request({
      headers: {
        authorization,
        'content-type': 'application/json',
      },
    }));

    expectError(response, 401, 'Unauthorized');
  });

  it.each([
    ['null identity', async () => null],
    ['authentication error', async () => { throw new Error(`auth failure ${TOKEN}`); }],
  ])('normalizes %s to the same generic 401', async (_case, authenticate) => {
    const response = await createHandler({ authenticate })(request());

    expectError(response, 401, 'Unauthorized');
  });

  it('maps missing, expired, and owner-mismatched package abstraction to one generic 404', async () => {
    const response = await createHandler({ getPackage: async () => null })(request());

    expectError(response, 404, 'Not found');
  });

  it.each([
    ['non-object envelope', () => [] as unknown as PackageRecord],
    ['missing envelope field', () => ({ encrypted_package: bytea(Buffer.alloc(32)) }) as PackageRecord],
    ['bytea without prefix', () => ({ ...encryptPackage(), encrypted_package: '00' })],
    ['empty bytea', () => ({ ...encryptPackage(), encrypted_package: '\\x' })],
    ['odd bytea hex', () => ({ ...encryptPackage(), encrypted_package: '\\x0' })],
    ['invalid bytea hex', () => ({ ...encryptPackage(), encrypted_package: '\\xgg' })],
    ['ciphertext shorter than tag', () => ({ ...encryptPackage(), encrypted_package: bytea(Buffer.alloc(15)) })],
    ['malformed nonce bytea', () => ({ ...encryptPackage(), package_nonce: '\\xzz' })],
    ['short nonce', () => ({ ...encryptPackage(), package_nonce: bytea(Buffer.alloc(11)) })],
    ['long nonce', () => ({ ...encryptPackage(), package_nonce: bytea(Buffer.alloc(13)) })],
    ['invalid AAD room UUID', () => ({ ...encryptPackage(), aad_room_id: 'room-1' })],
    ['string key version', () => ({ ...encryptPackage(), encryption_key_version: '7' }) as unknown as PackageRecord],
    ['negative key version', () => ({ ...encryptPackage(), encryption_key_version: -1 })],
    ['zero key version', () => ({ ...encryptPackage(), encryption_key_version: 0 })],
    ['fractional key version', () => ({ ...encryptPackage(), encryption_key_version: 1.5 })],
    ['unsafe integer key version', () => ({
      ...encryptPackage(),
      encryption_key_version: Number.MAX_SAFE_INTEGER + 1,
    })],
    ['unsafe traversal filename', () => ({ ...encryptPackage(), sanitized_filename: '../secret.zip' })],
    ['unsafe slash filename', () => ({ ...encryptPackage(), sanitized_filename: 'team/report.zip' })],
    ['unsafe backslash filename', () => ({ ...encryptPackage(), sanitized_filename: 'team\\report.zip' })],
    ['unsafe control filename', () => ({ ...encryptPackage(), sanitized_filename: 'team\r\nX-Evil.zip' })],
    ['non-ZIP filename', () => ({ ...encryptPackage(), sanitized_filename: 'report.pdf' })],
    ['untrimmed filename', () => ({ ...encryptPackage(), sanitized_filename: ' report.zip' })],
    ['overlong filename', () => ({ ...encryptPackage(), sanitized_filename: `${'a'.repeat(177)}.zip` })],
  ])('returns a generic 500 for %s', async (_case, packageFactory) => {
    const response = await createHandler({ getPackage: async () => packageFactory() })(request());

    expectError(response, 500, 'Internal server error');
  });

  it('returns a generic 500 when the envelope references an unknown key version', async () => {
    const response = await createHandler({
      getPackage: async () => encryptPackage(ZIP_BYTES, { encryption_key_version: 8 }),
      encryptionKeys: new Map([[KEY_VERSION, KEY_BASE64]]),
    })(request());

    expectError(response, 500, 'Internal server error');
  });

  it('returns a generic 500 when authenticated plaintext is not a ZIP archive', async () => {
    const response = await createHandler({
      getPackage: async () => encryptPackage(Buffer.from('not a zip')),
    })(request());

    expectError(response, 500, 'Internal server error');
  });

  it.each([
    ['ciphertext', (stored: PackageRecord) => {
      const bytes = Buffer.from(stored.encrypted_package.slice(2), 'hex');
      bytes[0] ^= 1;
      return { ...stored, encrypted_package: bytea(bytes) };
    }],
    ['authentication tag', (stored: PackageRecord) => {
      const bytes = Buffer.from(stored.encrypted_package.slice(2), 'hex');
      bytes[bytes.length - 1] ^= 1;
      return { ...stored, encrypted_package: bytea(bytes) };
    }],
    ['AAD room binding', (stored: PackageRecord) => ({
      ...stored,
      aad_room_id: 'b2000000-0000-4000-8000-000000000099',
    })],
  ] as const)('returns a generic 500 for tampered %s', async (_case, tamper) => {
    const response = await createHandler({ getPackage: async () => tamper(encryptPackage()) })(request());

    expectError(response, 500, 'Internal server error');
  });

  it('returns 413 without detail when the stored encrypted package exceeds the 4 MiB cap plus its tag', async () => {
    const tooLarge = Buffer.alloc(MAX_HEALTH_REPORT_PACKAGE_BYTES + 17);
    const response = await createHandler({
      getPackage: async () => ({ ...encryptPackage(), encrypted_package: bytea(tooLarge) }),
    })(request());

    expectError(response, 413, 'Payload too large');
  });

  it('returns 413 without detail when a valid ZIP envelope decrypts to more than 4 MiB', async () => {
    const oversizedPlaintext = Buffer.alloc(MAX_HEALTH_REPORT_PACKAGE_BYTES + 1, 0x61);
    ZIP_BYTES.copy(oversizedPlaintext, 0, 0, 4);
    const response = await createHandler({
      getPackage: async () => encryptPackage(oversizedPlaintext),
    })(request());

    expectError(response, 413, 'Payload too large');
  });

  it('does not expose dependency errors, token, job ID, or filename in a 500 response', async () => {
    const getPackage = async () => {
      throw new Error(`private database failure ${TOKEN} ${JOB_ID} Team Øst – 2026.zip`);
    };

    const response = await createHandler({ getPackage })(request());
    const publicResponse = JSON.stringify({ headers: response.headers, body: response.body });

    expectError(response, 500, 'Internal server error');
    expect(publicResponse).not.toContain(TOKEN);
    expect(publicResponse).not.toContain(JOB_ID);
    expect(publicResponse).not.toContain('Team Øst');
    expect(publicResponse).not.toContain('database failure');
  });
});
