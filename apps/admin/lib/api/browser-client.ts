"use client";

import { ApiClient, assertApiUrl } from "@double-a/api-client";
import {
  ACTING_COMPANY_COOKIE,
  BASE_SESSION_COOKIE,
  SESSION_COOKIE,
  SESSION_EXPIRES_AT_COOKIE,
} from "./cookie-names";

/**
 * For client components calling the Tally API straight from the browser
 * (no Next.js server hop) — the counterpart to lib/api/session.ts's
 * getAuthedClient(), which only works server-side (next/headers `cookies()`
 * isn't available here). Session cookies are intentionally not httpOnly so
 * this can read them — see the tradeoff noted in session.ts.
 */

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return null;
}

function apiUrl(): string {
  return assertApiUrl(process.env.NEXT_PUBLIC_TALLY_API_URL, "NEXT_PUBLIC_TALLY_API_URL");
}

/** Reads the token fresh on every request — reflects login/logout/open-company without a page reload. */
export function getBrowserApiClient(): ApiClient {
  return new ApiClient({ baseUrl: apiUrl(), getToken: () => readCookie(SESSION_COOKIE) });
}

/** Unauthenticated client — login only. */
export function getBrowserBareClient(): ApiClient {
  return new ApiClient({ baseUrl: apiUrl(), getToken: () => null });
}

export function hasBrowserSession(): boolean {
  return Boolean(readCookie(SESSION_COOKIE));
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function deleteCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Client-side counterpart to lib/api/session.ts's startSession() — same
 * cookie names/attributes, just written via document.cookie instead of
 * next/headers cookies(), since login now happens as a browser-side REST
 * call instead of a Server Action. A cookie written here is just as visible
 * to proxy.ts (Middleware) and any Server Component on the next request —
 * client and server read/write the same literal cookie jar, there are not
 * two separate stores.
 */
export function startBrowserSession(token: string, expiresAt: string | null): void {
  const maxAge = expiresAt
    ? Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
    : ONE_YEAR_SECONDS;
  writeCookie(SESSION_COOKIE, token, maxAge);
  // A plain login always starts from the caller's own identity, never
  // mid-impersonation — seed BASE_SESSION (see session.ts) and drop any
  // stale acting-company marker, same as the server-side startSession(..., isNewLogin: true).
  writeCookie(BASE_SESSION_COOKIE, token, maxAge);
  deleteCookie(ACTING_COMPANY_COOKIE);
  if (expiresAt) {
    writeCookie(SESSION_EXPIRES_AT_COOKIE, expiresAt, maxAge);
  } else {
    deleteCookie(SESSION_EXPIRES_AT_COOKIE);
  }
}

export function endBrowserSession(): void {
  deleteCookie(SESSION_COOKIE);
  deleteCookie(BASE_SESSION_COOKIE);
  deleteCookie(ACTING_COMPANY_COOKIE);
  deleteCookie(SESSION_EXPIRES_AT_COOKIE);
}

export interface ActingCompany {
  id: string;
  name: string;
}

/** Superadmin "Open company" — swap SESSION to scoped token, keep BASE_SESSION for exit. */
export function startActingSession(token: string, company: ActingCompany): void {
  writeCookie(SESSION_COOKIE, token, ONE_YEAR_SECONDS);
  writeCookie(ACTING_COMPANY_COOKIE, JSON.stringify(company), ONE_YEAR_SECONDS);
}

/** Restore superadmin's own token — no API call. */
export function exitActingSession(): void {
  const base = readCookie(BASE_SESSION_COOKIE);
  if (base) writeCookie(SESSION_COOKIE, base, ONE_YEAR_SECONDS);
  deleteCookie(ACTING_COMPANY_COOKIE);
}
