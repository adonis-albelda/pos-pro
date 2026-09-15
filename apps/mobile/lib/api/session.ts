import * as SecureStore from "expo-secure-store";
import { ApiClient, ApiError } from "@double-a/api-client";
import { logout, me } from "@double-a/api-client/queries";
import { ROLES, type User } from "@double-a/shared-types";
import { resetLocalData } from "@/db";
import {
  clearEnrolledCompanyId,
  clearEnrolledLocationId,
  clearEnrolledRole,
  getEnrolledCompanyId,
  setEnrolledCompanyId,
  setEnrolledLocationId,
  setEnrolledRole,
} from "@/lib/device";
import { apiUrl, clientHeaders, createScopedClient } from "./client";

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
 * The one API client on this device. Built fresh per call — cheap, stateless,
 * always reads the current token. Touched by manual sync/unlock same as
 * before, plus now the live stock-broadcast socket (sync/realtime.ts) and
 * the eager sale push while online mode is on (the default) — see CLAUDE.md
 * §1.
 */
export function getApiClient(): ApiClient {
  return new ApiClient({
    baseUrl: apiUrl(),
    getToken: () => getSessionToken(),
    extraHeaders: clientHeaders(),
  });
}

export async function isEnrolled(): Promise<boolean> {
  return Boolean(await getSessionToken());
}

/**
 * The admin token an admin-role cashier's PIN unlock mints, held in memory
 * only (never SecureStore) — same "shift ends when the app closes" lifetime
 * as `useSession()`'s `cashier`. This is what `apps/mobile/app/admin/**`
 * screens must call through instead of `getApiClient()`: the terminal token
 * is role=terminal forever and 403s on actsAsAdmin()-gated policies (suppliers,
 * expenses, purchase orders, some reports) no matter who unlocked it.
 */
let adminToken: string | null = null;
let adminTokenExpiresAt: string | null = null;

export function setAdminToken(token: string | null, expiresAt: string | null = null): void {
  adminToken = token;
  adminTokenExpiresAt = token ? expiresAt : null;
}

export function getAdminToken(): string | null {
  return adminToken;
}

export function getAdminTokenExpiresAt(): string | null {
  return adminTokenExpiresAt;
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

/**
 * The narrower self-service token a non-admin cashier's PIN unlock mints
 * (VerifyCashierPinController) — same in-memory, no-SecureStore lifetime as
 * adminToken above, just a smaller ability set (change my own PIN/password,
 * log myself out). An admin-role cashier never gets one of these; adminToken
 * already covers self-service for them.
 */
let cashierToken: string | null = null;
let cashierTokenExpiresAt: string | null = null;

export function setCashierToken(token: string | null, expiresAt: string | null = null): void {
  cashierToken = token;
  cashierTokenExpiresAt = token ? expiresAt : null;
}

export function getCashierToken(): string | null {
  return cashierToken;
}

export function getCashierTokenExpiresAt(): string | null {
  return cashierTokenExpiresAt;
}

/**
 * For self-service calls only (change my own PIN/password) — never for
 * admin-gated screens, those must keep using getAdminApiClient. Prefers
 * adminToken when present (an admin cashier's admin_token already covers
 * self-service; they never get a separate cashierToken) then falls back to
 * cashierToken. The device token is deliberately never used here: it has
 * none of the abilities self-service calls need, and using it would just
 * reproduce the same 403 this exists to fix.
 */
export function getSelfServiceApiClient(): ApiClient {
  const token = adminToken ?? cashierToken;
  if (!token) {
    throw new Error("Unlock again to change your PIN.");
  }
  return createScopedClient(token);
}

async function bindEnrolledCompany(profile: User): Promise<void> {
  if (profile.role !== ROLES.ADMIN && profile.role !== ROLES.TERMINAL) {
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

  if (profile.role === ROLES.ADMIN || profile.role === ROLES.TERMINAL) {
    await setEnrolledRole(profile.role);
  }

  if (profile.locationId) {
    await setEnrolledLocationId(profile.locationId);
  }
}

/**
 * Called at the start of a sync/unlock. Sanctum tokens are opaque and
 * non-refreshable (unlike the old Supabase JWT, which was refreshed here
 * before it expired) — a terminal token is minted non-expiring at
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
  await clearEnrolledLocationId();
  await clearEnrolledRole();
  setAdminToken(null);
  setCashierToken(null);
}

export { createScopedClient };
