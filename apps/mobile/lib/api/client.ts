import Constants from "expo-constants";
import { ApiClient, assertApiUrl } from "@double-a/api-client";

/**
 * Base URL is baked into the app binary via EXPO_PUBLIC_ — same tradeoff as
 * any mobile app shipping its API host, not a secret the way apps/admin's
 * TALLY_API_URL is (that one stays server-side, never reaches a browser).
 */
export function apiUrl(): string {
  return assertApiUrl(process.env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL");
}

/** app.json's `expo.version` — the one number that actually reflects what's installed on this device, unlike a store listing which lags behind. */
export const APP_VERSION: string = Constants.expoConfig?.version ?? "unknown";

export const VERSION_HEADERS = { "X-App-Version": APP_VERSION };

/** Unauthenticated client — login only. */
export function createBareClient(): ApiClient {
  return new ApiClient({ baseUrl: apiUrl(), getToken: () => null, extraHeaders: VERSION_HEADERS });
}

/** Authenticated client bound to a fixed token — used for the one-off admin-scoped call during terminal setup (enrollDevice). */
export function createScopedClient(token: string): ApiClient {
  return new ApiClient({ baseUrl: apiUrl(), getToken: () => token, extraHeaders: VERSION_HEADERS });
}
