const KEY = 'estimat_turnstile_verified_until';
const TTL_MS = 15 * 60 * 1000;
let memoryVerifiedUntil = 0;

export function markTurnstileVerified(): void {
  memoryVerifiedUntil = Date.now() + TTL_MS;
  try {
    sessionStorage.setItem(KEY, String(memoryVerifiedUntil));
  } catch {
    // The database remains the security boundary if browser storage is unavailable.
  }
}

export function hasRecentTurnstileVerification(): boolean {
  return turnstileVerificationRemainingMs() > 0;
}

export function turnstileVerificationRemainingMs(): number {
  if (memoryVerifiedUntil > Date.now()) return memoryVerifiedUntil - Date.now();
  try {
    const verifiedUntil = Number(sessionStorage.getItem(KEY));
    return Number.isFinite(verifiedUntil) ? Math.max(0, verifiedUntil - Date.now()) : 0;
  } catch {
    return 0;
  }
}
