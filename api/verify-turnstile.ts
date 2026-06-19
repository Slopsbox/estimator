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

  const cfResponse = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    }
  );

  const result = await cfResponse.json() as { success: boolean };

  if (result.success) {
    return res.status(200).json({ success: true });
  }

  return res.status(403).json({ success: false, error: 'Verification failed' });
}
