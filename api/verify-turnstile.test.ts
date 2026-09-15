// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createTurnstileVerificationHandler } from './_lib/turnstile-verification.js';

const TOKEN = 'turnstile-token';
const ACCESS_TOKEN = 'supabase-access-token';
const USER_ID = '10000000-0000-4000-8000-000000000001';

describe('createTurnstileVerificationHandler', () => {
  it('validates identity and challenge in parallel before attesting', async () => {
    let resolveAuthentication!: (value: string | null) => void;
    let resolveChallenge!: (value: boolean) => void;
    const authenticate = vi.fn(() => new Promise<string | null>((resolve) => { resolveAuthentication = resolve; }));
    const verifyChallenge = vi.fn(() => new Promise<boolean>((resolve) => { resolveChallenge = resolve; }));
    const attest = vi.fn().mockResolvedValue(true);
    const handler = createTurnstileVerificationHandler({ authenticate, verifyChallenge, attest });

    const result = handler({ authorization: `Bearer ${ACCESS_TOKEN}`, token: TOKEN });

    expect(authenticate).toHaveBeenCalledOnce();
    expect(verifyChallenge).toHaveBeenCalledOnce();
    expect(attest).not.toHaveBeenCalled();
    resolveAuthentication(USER_ID);
    resolveChallenge(true);
    await expect(result).resolves.toEqual({ status: 200, body: { success: true } });
  });

  it('binds a valid Turnstile challenge to the authenticated Supabase user', async () => {
    const attest = vi.fn().mockResolvedValue(true);
    const handler = createTurnstileVerificationHandler({
      authenticate: vi.fn().mockResolvedValue(USER_ID),
      verifyChallenge: vi.fn().mockResolvedValue(true),
      attest,
    });

    const result = await handler({ authorization: `Bearer ${ACCESS_TOKEN}`, token: TOKEN });

    expect(result).toEqual({ status: 200, body: { success: true } });
    expect(attest).toHaveBeenCalledWith(USER_ID);
  });

  it('rejects missing auth, invalid challenges and failed attestations', async () => {
    const authenticate = vi.fn().mockResolvedValue(USER_ID);
    const verifyChallenge = vi.fn().mockResolvedValue(false);
    const handler = createTurnstileVerificationHandler({
      authenticate,
      verifyChallenge,
      attest: vi.fn().mockResolvedValue(false),
    });

    await expect(handler({ authorization: null, token: TOKEN })).resolves.toMatchObject({ status: 401 });
    await expect(handler({ authorization: `Bearer ${ACCESS_TOKEN}`, token: TOKEN })).resolves.toMatchObject({ status: 403 });

    verifyChallenge.mockResolvedValue(true);
    await expect(handler({ authorization: `Bearer ${ACCESS_TOKEN}`, token: TOKEN })).resolves.toMatchObject({ status: 500 });
  });

  it('rejects malformed or oversized tokens before external calls', async () => {
    const verifyChallenge = vi.fn();
    const handler = createTurnstileVerificationHandler({
      authenticate: vi.fn(),
      verifyChallenge,
      attest: vi.fn(),
    });

    await expect(handler({ authorization: `Bearer ${ACCESS_TOKEN}`, token: '' })).resolves.toMatchObject({ status: 400 });
    await expect(handler({ authorization: `Bearer ${ACCESS_TOKEN}`, token: 'x'.repeat(2049) })).resolves.toMatchObject({ status: 400 });
    expect(verifyChallenge).not.toHaveBeenCalled();
  });
});
