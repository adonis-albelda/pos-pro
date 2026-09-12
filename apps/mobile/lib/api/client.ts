import Constants from "expo-constants";
import { Platform } from "react-native";
import { ApiClient, assertApiUrl } from "@double-a/api-client";

/**
 * Base URL is baked into the app binary via EXPO_PUBLIC_ — same tradeoff as
 * any mobile app shipping its API host, not a secret the way apps/admin's
 * TALLY_API_URL is (that one stays server-side, never reaches a browser).
 *
 * Local Herd + Android emulator:
 * - Emulator cannot resolve `*.test`, and OkHttp ignores / rejects a JS `Host`
 *   header that disagrees with the URL host.
 * - Point EXPO_PUBLIC_API_URL at http://10.0.2.2:8088/v1 and run
 *   `node scripts/herd-emulator-proxy.mjs` (sets Host for Herd).
 * - Safety net: any remaining `*.test` URL is rewritten to 10.0.2.2 on Android.
 */
export function apiUrl(): string {
  const raw = assertApiUrl(process.env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL");
  if (Platform.OS !== "android") return raw;
  try {
    const url = new URL(raw);
    if (!url.hostname.endsWith(".test")) return raw;
    url.hostname = "10.0.2.2";
    const rewritten = url.toString().replace(/\/+$/, "");
    if (__DEV__) console.warn(`[api] rewritten ${raw} → ${rewritten}`);
    return rewritten;
  } catch {
    return raw;
  }
}

/**
 * Do NOT send a Host header when talking to 10.0.2.2 — OkHttp derives Host
 * from the URL and a mismatch can fail the whole request. The herd-emulator
 * proxy rewrites Host to the Herd site name instead.
 */
export function apiHostHeader(): Record<string, string> {
  return {};
}

/** app.json's `expo.version` — the one number that actually reflects what's installed on this device, unlike a store listing which lags behind. */
export const APP_VERSION: string = Constants.expoConfig?.version ?? "unknown";

export const VERSION_HEADERS = { "X-App-Version": APP_VERSION };

function clientHeaders(): Record<string, string> {
  return { ...VERSION_HEADERS, ...apiHostHeader() };
}

/** Unauthenticated client — login only. */
export function createBareClient(): ApiClient {
  const baseUrl = apiUrl();
  if (__DEV__) console.warn("[api] baseUrl:", baseUrl);
  return new ApiClient({ baseUrl, getToken: () => null, extraHeaders: clientHeaders() });
}

/** Authenticated client bound to a fixed token — used for the one-off admin-scoped call during terminal setup (enrollDevice). */
export function createScopedClient(token: string): ApiClient {
  return new ApiClient({ baseUrl: apiUrl(), getToken: () => token, extraHeaders: clientHeaders() });
}
