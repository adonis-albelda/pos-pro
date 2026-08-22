import * as SecureStore from "expo-secure-store";
import { ApiClient, ApiError } from "@double-a/api-client";
import { logout, me } from "@double-a/api-client/queries";
import type { User } from "@double-a/shared-types";
import { resetLocalData } from "@/db";
import {
  clearEnrolledCompanyId,
  getEnrolledCompanyId,
  setEnrolledCompanyId,
} from "@/lib/device";
import { apiUrl, createScopedClient, VERSION_HEADERS } from "./client";

const SESSION_TOKEN_KEY = "double-a.session-token";

export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function setSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

async function clearSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}

/**
 * The one API client on this device. It is only ever touched during a
 * manual sync/unlock: no realtime subscriptions, no background refresh,
 * nothing that fires on reconnect.
 */
export function getApiClient(): ApiClient {
  return new ApiClient({ baseUrl: apiUrl(), getToken: () => getSessionToken(), extraHeaders: VERSION_HEADERS });
}

export async function isEnrolled(): Promise<boolean> {
  return Boolean(await getSessionToken());
}

/**
 * The admin token an admin-role cashier's PIN unlock mints, held in memory
 * only (never SecureStore) — same "shift ends when the app closes" lifetime
 * as `useSession()`'s `cashier`. This is what `apps/mobile/app/admin/**`
 * screens must call through instead of `getApiClient()`: the device token
 * is role=device forever and 403s on actsAsAdmin()-gated policies (suppliers,
 * expenses, purchase orders, some reports) no matter who unlocked it.
 */
let adminToken: string | null = null;

export function setAdminToken(token: string | null): void {
  adminToken = token;
}

/**
 * Throws rather than silently falling back to the device token — a silent
 * fallback would just reproduce the 403 one screen later with a worse error.
 */
export function getAdminApiClient(): ApiClient {
  if (!adminToken) {
    throw new Error("Unlock again with an admin PIN to use this screen.");
  }
  return createScopedClient(adminToken);
}

async function bindEnrolledCompany(profile: User): Promise<void> {
  if (profile.role !== "admin" && profile.role !== "device") {
    throw new Error("This terminal is not set up yet. Finish setup before syncing.");
  }
  if (!profile.companyIsActive) {
    throw new Error("This shop account is disabled. Contact the office.");
  }
  if (!profile.companyId) {
    throw new Error("This login is not linked to a company.");
  }

  const stored = await getEnrolledCompanyId();
  if (stored && stored !== profile.companyId) {
    await resetLocalData();
  }
  await setEnrolledCompanyId(profile.companyId);
}

/**
 * Called at the start of a sync/unlock. Sanctum tokens are opaque and
 * non-refreshable (unlike the old Supabase JWT, which was refreshed here
 * before it expired) — a device/terminal token is minted non-expiring at
 * enrollment, so there is nothing to refresh. This just confirms the
 * session is still accepted server-side (a revoked or expired token 401s)
 * and re-binds the enrolled company, same as before.
 */
export async function ensureFreshSession(): Promise<void> {
  const token = await getSessionToken();
  if (!token) {
    throw new Error("This terminal is not set up yet. Finish setup before syncing.");
  }

  let profile: User;
  try {
    profile = await me(getApiClient());
  } catch (error) {
    if (error instanceof ApiError && (error.isUnauthenticated || error.isForbidden)) {
      throw new Error("This terminal needs to be set up again — its sign-in is no longer accepted.");
    }
    throw error;
  }

  await bindEnrolledCompany(profile);
}

/**
 * Drop the persisted session and local catalogue so this tablet can enroll
 * into a different company. Refuses while unsynced sales exist (enforced by
 * resetLocalData, unchanged).
 */
export async function unenrollTerminal(): Promise<void> {
  await resetLocalData();
  try {
    await logout(getApiClient());
  } catch {
    // Token may already be invalid/expired — clearing local state below is what matters.
  }
  await clearSessionToken();
  await clearEnrolledCompanyId();
  setAdminToken(null);
}

export { createScopedClient };
