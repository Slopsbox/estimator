import { createClient } from '@supabase/supabase-js';
import {
  MAX_DOWNLOAD_REQUEST_BYTES,
  createHealthCheckDownloadHandler,
  parseHealthReportKey,
  type StoredHealthReportPackage,
} from './_lib/health-check-download';

const KEY_ENV_PATTERN = /^HEALTH_REPORT_AES_KEY_V([1-9][0-9]*)$/;

function readRequiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function readEncryptionKeys(): ReadonlyMap<number, string> {
  const keys = new Map<number, string>();
  for (const [name, value] of Object.entries(process.env)) {
    const match = KEY_ENV_PATTERN.exec(name);
    if (!match || value === undefined) continue;
    parseHealthReportKey(value);
    keys.set(Number(match[1]), value);
  }
  if (keys.size === 0) throw new Error('Missing health report encryption keys');
  return keys;
}

function createDependencies() {
  const supabaseUrl = readRequiredEnvironment('SUPABASE_URL');
  const anonKey = readRequiredEnvironment('SUPABASE_ANON_KEY');
  const serviceRoleKey = readRequiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const clientOptions = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  } as const;
  const authClient = createClient(supabaseUrl, anonKey, clientOptions);
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, clientOptions);

  return {
    encryptionKeys: readEncryptionKeys(),
    async authenticate(token: string): Promise<string | null> {
      const { data, error } = await authClient.auth.getUser(token);
      if (error || !data.user) return null;
      return data.user.id;
    },
    async getPackage(jobId: string, userId: string): Promise<StoredHealthReportPackage | null> {
      const { data, error } = await serviceClient.rpc(
        'get_health_check_download_package_for_service',
        { p_job_id: jobId, p_user_id: userId },
      );
      if (error) throw new Error('Package lookup failed');
      if (!Array.isArray(data) || data.length === 0) return null;
      if (data.length !== 1) throw new Error('Package lookup was not unique');
      return data[0] as StoredHealthReportPackage;
    },
  };
}

function errorResponse(
  status: number,
  error: string,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return Response.json(
    { error },
    {
      status,
      headers: {
        'cache-control': 'no-store, private',
        pragma: 'no-cache',
        'x-content-type-options': 'nosniff',
        ...headers,
      },
    },
  );
}

async function readRawBody(request: Request): Promise<Uint8Array> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_DOWNLOAD_REQUEST_BYTES) {
      throw new Error('request_too_large');
    }
  }
  if (request.headers.has('transfer-encoding') && contentLength !== null) {
    throw new Error('ambiguous_body_length');
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_DOWNLOAD_REQUEST_BYTES) {
        await reader.cancel();
        throw new Error('request_too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (contentLength !== null && Number(contentLength) !== totalBytes) {
    throw new Error('invalid_content_length');
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function fetchHealthCheckDownload(request: Request): Promise<Response> {
  if (process.env.ENABLE_HEALTH_REPORT_DOWNLOAD !== 'true') {
    return errorResponse(404, 'Not found');
  }
  if (request.method !== 'POST') {
    return errorResponse(405, 'Method not allowed', { allow: 'POST' });
  }

  let rawBody: Uint8Array;
  try {
    rawBody = await readRawBody(request);
  } catch {
    return errorResponse(413, 'Payload too large');
  }

  let result;
  try {
    result = await createHealthCheckDownloadHandler(createDependencies())({
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: rawBody,
    });
  } catch {
    return errorResponse(500, 'Internal server error');
  }

  if (result.body instanceof Uint8Array) {
    return new Response(result.body, { status: result.status, headers: result.headers });
  }
  return Response.json(result.body, { status: result.status, headers: result.headers });
}

export default {
  fetch: fetchHealthCheckDownload,
};
