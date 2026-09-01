import "server-only";
import { cookies, headers } from "next/headers";
import { ApiClient, ApiError, assertApiUrl } from "@double-a/api-client";
import { me as fetchMe } from "@double-a/api-client/queries";
import type { User } from "@double-a/shared-types";
import { demoDatabaseHeaders } from "@/lib/demo-host";
import {
  ACTING_COMPANY_COOKIE,
  BASE_SESSION_COOKIE,
  DEMO_MODE_COOKIE,
  SESSION_COOKIE,
} from "./cookie-names";

function apiUrl(): string {
  return assertApiUrl(process.env.NEXT_PUBLIC_TALLY_API_URL, "NEXT_PUBLIC_TALLY_API_URL");
}

/**
 * Session lives in three cookies instead of a single Supabase JWT:
 *
 *  - SESSION: the bearer token every authenticated call uses right now.
 *  - BASE_SESSION: a superadmin's own (non-acting) token, set once at login
 *    and left untouched by "Open company" — restoring it is how "Exit
 *    company" works, no API call needed (there is no "close" endpoint,
 *    opening just issues another scoped token; see queries/companies.ts).
 *  - ACTING_COMPANY: which company SESSION is currently scoped to, purely
 *    for UI routing/display (CLAUDE.md §15's "impersonation banner" and the
 *    proxy's superadmin routing). Never trusted for authorization — the API
 *    enforces real scoping off the token itself via company.context.
 *
 * NOT httpOnly, by deliberate choice: the browser calls the Tally API
 * directly (lib/api/browser-client.ts reads/writes SESSION off
 * document.cookie), which only works if client JS can read the token. That
 * trades away the XSS protection an httpOnly cookie gives a bearer token —
 * a script injected into this dashboard can read and exfiltrate it.
 * Accepted tradeoff for calling the API straight from client
 * components/TanStack Query instead of proxying every read through a
 * Server Component/Route Handler.
 *
 * Login and logout are themselves browser-side REST calls now (see
 * app/login/login-form.tsx, app/login/actions.ts) — this file no longer
 * writes SESSION/BASE_SESSION at all, only reads them (getSessionToken,
 * getAuthedClient, getCurrentUser) for Server Components/Actions/Route
 * Handlers, plus the superadmin "Open/Exit company" acting-session swap
 * below, which stays server-side deliberately (see queries/companies.ts —
 * the scoped token there is minted and consumed within one request, never
 * exposed to client JS).
 *
 * Cookie names live in ./cookie-names — proxy.ts (Middleware) and
 * browser-client.ts both need the same names but can't use next/headers
 * `cookies()`, so they're factored out rather than duplicated.
 */

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

interface CookieWriteOptions {
  httpOnly: false;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge?: number;
}

function writeOptions(expiresAt: string | null): CookieWriteOptions {
  const base: CookieWriteOptions = {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
  if (!expiresAt) return { ...base, maxAge: ONE_YEAR_SECONDS };
  const seconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  return seconds > 0 ? { ...base, maxAge: seconds } : base;
}

export interface ActingCompany {
  id: string;
  name: string;
}

/** "Open company" — swaps SESSION to the scoped token, leaves BASE_SESSION alone. */
export async function setActingSession(
  token: string,
  company: ActingCompany,
): Promise<void> {
  const store = await cookies();
  const options = writeOptions(null);
  store.set(SESSION_COOKIE, token, options);
  store.set(ACTING_COMPANY_COOKIE, JSON.stringify(company), options);
}

/** "Exit company" — restores the superadmin's own token, no API call needed. */
export async function exitActingSession(): Promise<void> {
  const store = await cookies();
  const base = store.get(BASE_SESSION_COOKIE)?.value;
  if (base) store.set(SESSION_COOKIE, base, writeOptions(null));
  store.delete(ACTING_COMPANY_COOKIE);
}

export async function getActingCompany(): Promise<ActingCompany | null> {
  const store = await cookies();
  const raw = store.get(ACTING_COMPANY_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActingCompany;
  } catch {
    return null;
  }
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** Bound to the current request's session cookie — the one client Server Components/Actions should use for every authenticated call. */
export function getAuthedClient(): ApiClient {
  return new ApiClient({
    baseUrl: apiUrl(),
    getToken: () => getSessionToken(),
    getExtraHeaders: async () => {
      const host = (await headers()).get("host") ?? "";
      const store = await cookies();
      const demoModeCookie = store.get(DEMO_MODE_COOKIE)?.value === "1";
      return demoDatabaseHeaders(host, demoModeCookie);
    },
  });
}

/** Null when there's no session or the token is no longer valid — never throws. */
export async function getCurrentUser(): Promise<User | null> {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    return await fetchMe(getAuthedClient());
  } catch (error) {
    if (error instanceof ApiError && (error.isUnauthenticated || error.isForbidden)) return null;
    throw error;
  }
}
