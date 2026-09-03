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
  if (memoryVerifiedUntil > Date.now()) return true;
  try {
    const verifiedUntil = Number(sessionStorage.getItem(KEY));
    return Number.isFinite(verifiedUntil) && verifiedUntil > Date.now();
  } catch {
    return false;
  }
}
