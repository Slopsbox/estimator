const MAX_TOKEN_LENGTH = 2048;
const BEARER_PATTERN = /^Bearer ([^\s]+)$/;

export interface TurnstileVerificationDependencies {
  authenticate(token: string): Promise<string | null>;
  verifyChallenge(token: string): Promise<boolean>;
  attest(userId: string): Promise<boolean>;
}

export function createTurnstileVerificationHandler({
  authenticate,
  verifyChallenge,
  attest,
}: TurnstileVerificationDependencies) {
  return async function verify(input: {
    readonly authorization: string | null;
    readonly token: unknown;
  }): Promise<{ status: number; body: { success: boolean; error?: string } }> {
    if (typeof input.token !== 'string' || input.token.length < 1 || input.token.length > MAX_TOKEN_LENGTH) {
      return response(400, 'Invalid request');
    }

    const authMatch = input.authorization ? BEARER_PATTERN.exec(input.authorization) : null;
    if (!authMatch) return response(401, 'Unauthorized');

    let userId: string | null;
    try {
      userId = await authenticate(authMatch[1]);
    } catch {
      return response(401, 'Unauthorized');
    }
    if (!userId) return response(401, 'Unauthorized');

    try {
      if (!await verifyChallenge(input.token)) return response(403, 'Verification failed');
      if (!await attest(userId)) return response(500, 'Internal server error');
    } catch {
      return response(502, 'Verification unavailable');
    }

    return { status: 200, body: { success: true } };
  };
}

function response(status: number, error: string) {
  return { status, body: { success: false, error } };
}
