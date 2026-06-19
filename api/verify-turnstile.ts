import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
