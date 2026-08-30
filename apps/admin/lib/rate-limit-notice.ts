"use client";

/**
 * Fired from QueryProvider's global queryCache/mutationCache onError
 * whenever any API call comes back 429 or 5xx — DemoSessionBanner listens
 * so a throttled/overloaded demo session gets the "you're the one causing
 * this" explanation surfaced right where the session countdown already
 * lives, regardless of which page/component made the failing call.
 */
const RATE_LIMIT_EVENT = "double-a:rate-limited";

export function notifyRateLimited(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RATE_LIMIT_EVENT));
}

export function onRateLimited(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(RATE_LIMIT_EVENT, callback);
  return () => window.removeEventListener(RATE_LIMIT_EVENT, callback);
}
