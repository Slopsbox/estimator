import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============================================================
// Enkel in-memory rate limiter per serverless function instance
// Begrenser antall verifiseringsforsøk per IP per tidvindu
// ============================================================
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60_000; // 1 minutt

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > MAX_ATTEMPTS;
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

  const { token } = req.body ?? {};
  if (!token) {
    return res.status(400).json({ success: false, error: 'Missing token' });
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ success: false, error: 'Server misconfigured' });
  }

  let cfResponse: Response;
  try {
    cfResponse = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, response: token }),
      }
    );
  } catch (err) {
    console.error('[turnstile] Network error contacting Cloudflare:', err);
    return res.status(502).json({ success: false, error: 'Could not reach Cloudflare' });
  }

  const result = await cfResponse.json() as {
    success: boolean;
    'error-codes'?: string[];
    hostname?: string;
    challenge_ts?: string;
  };

  if (result.success) {
    return res.status(200).json({ success: true });
  }

  // Log feilkodene fra Cloudflare for debugging i Vercel-loggene
  console.error('[turnstile] Verification failed. Error codes:', result['error-codes']);

  return res.status(403).json({ success: false, error: 'Verification failed', codes: result['error-codes'] });
}
