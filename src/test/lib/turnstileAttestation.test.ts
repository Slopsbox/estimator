import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasRecentTurnstileVerification,
  markTurnstileVerified,
  turnstileVerificationRemainingMs,
} from '../../lib/turnstileAttestation';

describe('turnstileAttestation', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps a client navigation marker for 15 minutes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    markTurnstileVerified();
    expect(hasRecentTurnstileVerification()).toBe(true);
    expect(turnstileVerificationRemainingMs()).toBe(15 * 60 * 1000);

    vi.spyOn(Date, 'now').mockReturnValue(1_000 + 15 * 60 * 1000);
    expect(hasRecentTurnstileVerification()).toBe(false);
    expect(turnstileVerificationRemainingMs()).toBe(0);
  });
});
