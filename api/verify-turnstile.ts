import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createTurnstileVerificationHandler } from './_lib/turnstile-verification.js';

// ============================================================
// Enkel in-memory rate limiter per serverless function instance
// Begrenser antall verifiseringsforsøk per IP per tidvindu
// ============================================================
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60_000; // 1 minutt

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  if (attempts.size > 1000) {
    for (const [key, value] of attempts) {
      if (value.resetAt <= now) attempts.delete(key);
    }
  }
  const entry = attempts.get(ip);

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function createDependencies() {
  const url = requiredEnvironment('SUPABASE_URL');
  const anonKey = requiredEnvironment('SUPABASE_ANON_KEY');
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const secret = requiredEnvironment('TURNSTILE_SECRET_KEY');
  const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;
  const authClient = createClient(url, anonKey, options);
  const serviceClient = createClient(url, serviceRoleKey, options);

  return {
    async authenticate(token: string) {
      const { data, error } = await authClient.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },
    async verifyChallenge(token: string) {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, response: token }),
      });
      if (!response.ok) return false;
      const result = await response.json() as { success?: boolean };
      return result.success === true;
    },
    async attest(userId: string) {
      const { data, error } = await serviceClient.rpc('attest_turnstile_for_service', { p_user_id: userId });
      return !error && data === true;
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting basert på IP
  const ip =
    (Array.isArray(req.headers['x-forwarded-for'])
      ? req.headers['x-forwarded-for'][0]
      : req.headers['x-forwarded-for']) ??
    req.socket?.remoteAddress ??
    'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests',
    });
  }

  let result;
  try {
    const handler = createTurnstileVerificationHandler(createDependencies());
    const authorization = Array.isArray(req.headers.authorization)
      ? null
      : req.headers.authorization ?? null;
    result = await handler({ authorization, token: req.body?.token });
  } catch {
    return res.status(500).json({ success: false, error: 'Server misconfigured' });
  }
  return res.status(result.status).json(result.body);
}
