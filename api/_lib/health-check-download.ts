import { createDecipheriv } from 'node:crypto';

export const MAX_DOWNLOAD_REQUEST_BYTES = 1024;
export const MAX_HEALTH_REPORT_PACKAGE_BYTES = 4 * 1024 * 1024;

const AUTHORIZATION_HEADER_MAX_BYTES = 4096;
const GCM_TAG_BYTES = 16;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BYTEA_HEX_PATTERN = /^\\x(?:[0-9a-f]{2})+$/i;
const BASE64_32_BYTE_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export interface HealthCheckDownloadRequest {
  readonly method?: string;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly body?: unknown;
}

export interface HealthCheckDownloadResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Uint8Array | { readonly error: string };
}

export interface StoredHealthReportPackage {
  readonly encrypted_package: string;
  readonly package_nonce: string;
  readonly encryption_key_version: number;
  readonly sanitized_filename: string;
  readonly aad_room_id: string;
}

export interface HealthCheckDownloadDependencies {
  readonly authenticate: (token: string) => Promise<string | null>;
  readonly getPackage: (
    jobId: string,
    userId: string,
  ) => Promise<StoredHealthReportPackage | null>;
  readonly encryptionKeys: ReadonlyMap<number, string>;
}

interface HealthReportAadInput {
  readonly jobId: string;
  readonly aadRoomId: string;
  readonly keyVersion: number;
}

class PublicHttpError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

const ERROR_HEADERS = {
  'cache-control': 'no-store, private',
  pragma: 'no-cache',
  'x-content-type-options': 'nosniff',
};

export function buildHealthReportAad({
  jobId,
  aadRoomId,
  keyVersion,
}: HealthReportAadInput): string {
  if (!isUuid(jobId) || !isUuid(aadRoomId) || !isPositiveSafeInteger(keyVersion)) {
    throw new Error('Invalid health report AAD input');
  }

  return [
    'health-check-package-v1',
    `job_id=${jobId.toLowerCase()}`,
    `aad_room_id=${aadRoomId.toLowerCase()}`,
    'field=encrypted_package',
    `key_version=${keyVersion}`,
  ].join('\n');
}

export function parseHealthReportKey(value: string): Uint8Array {
  if (!BASE64_32_BYTE_PATTERN.test(value)) {
    throw new Error('Invalid health report key');
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== value) {
    throw new Error('Invalid health report key');
  }
  return decoded;
}

export function createHealthCheckDownloadHandler({
  authenticate,
  getPackage,
  encryptionKeys,
}: HealthCheckDownloadDependencies) {
  return async function handle(
    request: HealthCheckDownloadRequest,
  ): Promise<HealthCheckDownloadResponse> {
    try {
      if (request.method !== 'POST') {
        return errorResponse(405, 'Method not allowed', { allow: 'POST' });
      }

      assertJsonContentType(getSingleHeader(request.headers, 'content-type'));
      const jobId = parseRequestBody(request);
      const token = parseAuthorization(request.headers);

      let userId: string | null;
      try {
        userId = await authenticate(token);
      } catch {
        throw new PublicHttpError(401, 'Unauthorized');
      }
      if (!userId || !isUuid(userId)) {
        throw new PublicHttpError(401, 'Unauthorized');
      }

      const storedPackage = await getPackage(jobId, userId);
      if (storedPackage === null) {
        throw new PublicHttpError(404, 'Not found');
      }

      const envelope = parseEnvelope(storedPackage);
      if (envelope.encryptedPackage.length > MAX_HEALTH_REPORT_PACKAGE_BYTES + GCM_TAG_BYTES) {
        throw new PublicHttpError(413, 'Payload too large');
      }

      const encodedKey = encryptionKeys.get(envelope.keyVersion);
      if (encodedKey === undefined) {
        throw new Error('Unknown health report key version');
      }
      const key = parseHealthReportKey(encodedKey);
      const plaintext = decryptPackage({
        encryptedPackage: envelope.encryptedPackage,
        nonce: envelope.nonce,
        key,
        aad: buildHealthReportAad({
          jobId,
          aadRoomId: envelope.aadRoomId,
          keyVersion: envelope.keyVersion,
        }),
      });

      if (plaintext.length > MAX_HEALTH_REPORT_PACKAGE_BYTES) {
        throw new PublicHttpError(413, 'Payload too large');
      }
      if (!isZip(plaintext)) {
        throw new Error('Invalid health report package');
      }

      return {
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'cache-control': 'no-store, private',
          pragma: 'no-cache',
          'x-content-type-options': 'nosniff',
          'content-disposition': contentDisposition(envelope.filename),
        },
        body: plaintext,
      };
    } catch (error) {
      if (error instanceof PublicHttpError) {
        return errorResponse(error.status, error.publicMessage);
      }
      return errorResponse(500, 'Internal server error');
    }
  };
}

function assertJsonContentType(value: string | null): void {
  if (
    value === null
    || value.includes(',')
    || !/^application\/json(?:\s*;\s*charset=utf-8\s*)?$/i.test(value)
  ) {
    throw new PublicHttpError(415, 'Unsupported media type');
  }
}

function parseRequestBody(request: HealthCheckDownloadRequest): string {
  const contentLength = getSingleHeader(request.headers, 'content-length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_DOWNLOAD_REQUEST_BYTES) {
      throw new PublicHttpError(413, 'Payload too large');
    }
  }

  const serialized = serializeBody(request.body);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DOWNLOAD_REQUEST_BYTES) {
    throw new PublicHttpError(413, 'Payload too large');
  }

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new PublicHttpError(400, 'Invalid request');
  }

  if (!isPlainRecord(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'jobId')) {
    throw new PublicHttpError(400, 'Invalid request');
  }
  const jobId = value.jobId;
  if (typeof jobId !== 'string' || !isUuid(jobId)) {
    throw new PublicHttpError(400, 'Invalid request');
  }
  return jobId.toLowerCase();
}

function serializeBody(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8');
  if (body === undefined) return '';
  try {
    return JSON.stringify(body);
  } catch {
    throw new PublicHttpError(400, 'Invalid request');
  }
}

function parseAuthorization(
  headers: HealthCheckDownloadRequest['headers'],
): string {
  const value = getSingleHeader(headers, 'authorization');
  if (value === null || Buffer.byteLength(value, 'utf8') > AUTHORIZATION_HEADER_MAX_BYTES) {
    throw new PublicHttpError(401, 'Unauthorized');
  }
  const match = /^Bearer ([^\s]+)$/.exec(value);
  if (!match) {
    throw new PublicHttpError(401, 'Unauthorized');
  }
  return match[1];
}

function getSingleHeader(
  headers: HealthCheckDownloadRequest['headers'],
  name: string,
): string | null {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  if (!entry || typeof entry[1] !== 'string') return null;
  return entry[1];
}

function parseEnvelope(value: StoredHealthReportPackage) {
  if (!isPlainRecord(value)) throw new Error('Invalid health report envelope');
  const expectedKeys = [
    'encrypted_package',
    'package_nonce',
    'encryption_key_version',
    'sanitized_filename',
    'aad_room_id',
  ];
  if (
    Object.keys(value).length !== expectedKeys.length
    || expectedKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new Error('Invalid health report envelope');
  }

  if (
    typeof value.encrypted_package === 'string'
    && value.encrypted_package.length > 2 + (MAX_HEALTH_REPORT_PACKAGE_BYTES + GCM_TAG_BYTES) * 2
  ) {
    throw new PublicHttpError(413, 'Payload too large');
  }
  const encryptedPackage = parseBytea(value.encrypted_package);
  const nonce = parseBytea(value.package_nonce);
  if (encryptedPackage.length <= GCM_TAG_BYTES || nonce.length !== 12) {
    throw new Error('Invalid health report envelope');
  }
  if (!isPositiveSafeInteger(value.encryption_key_version)) {
    throw new Error('Invalid health report envelope');
  }
  if (!isUuid(value.aad_room_id) || !isSafeFilename(value.sanitized_filename)) {
    throw new Error('Invalid health report envelope');
  }

  return {
    encryptedPackage,
    nonce,
    keyVersion: value.encryption_key_version,
    filename: value.sanitized_filename,
    aadRoomId: value.aad_room_id.toLowerCase(),
  };
}

function parseBytea(value: unknown): Uint8Array {
  if (typeof value !== 'string' || !BYTEA_HEX_PATTERN.test(value)) {
    throw new Error('Invalid bytea');
  }
  return Buffer.from(value.slice(2), 'hex');
}

function isZip(value: Uint8Array): boolean {
  return value.length >= 4
    && value[0] === 0x50
    && value[1] === 0x4b
    && value[2] === 0x03
    && value[3] === 0x04;
}

function decryptPackage({
  encryptedPackage,
  nonce,
  key,
  aad,
}: {
  readonly encryptedPackage: Uint8Array;
  readonly nonce: Uint8Array;
  readonly key: Uint8Array;
  readonly aad: string;
}): Uint8Array {
  const tagOffset = encryptedPackage.length - GCM_TAG_BYTES;
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(encryptedPackage.subarray(tagOffset));
  return Buffer.concat([
    decipher.update(encryptedPackage.subarray(0, tagOffset)),
    decipher.final(),
  ]);
}

function contentDisposition(filename: string): string {
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="health-check-report.zip"; filename*=UTF-8''${encoded}`;
}

function isSafeFilename(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && Array.from(value).length >= 5
    && Array.from(value).length <= 180
    && value.toLowerCase().endsWith('.zip')
    && !value.includes('/')
    && !value.includes('\\')
    && !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    });
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function errorResponse(
  status: number,
  error: string,
  extraHeaders: Record<string, string> = {},
): HealthCheckDownloadResponse {
  return {
    status,
    headers: { ...ERROR_HEADERS, ...extraHeaders },
    body: { error },
  };
}
