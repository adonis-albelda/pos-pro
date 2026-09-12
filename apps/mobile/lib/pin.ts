import { me, verifyCashierPin } from "@double-a/api-client/queries";
import { ROLES } from "@double-a/shared-types";
import { ensureFreshSession, getApiClient } from "@/lib/api/session";

export type PinResult =
  | "ok"
  /** Wrong digits, or that person has no PIN set at all — indistinguishable. */
  | "wrong-pin"
  /** This terminal's own sign-in is not one the server accepts. */
  | "terminal-not-authorized";

export interface PinUnlock {
  result: PinResult;
  /**
   * Set only when the unlocked cashier is themselves an admin — a real
   * admin-scoped token, separate from this terminal's own token. Policies
   * gated on actsAsAdmin() (suppliers, expenses, purchase orders, some
   * reports) 403 a terminal token no matter who unlocked it; this is what
   * apps/mobile/app/admin/** calls need instead.
   */
  adminToken: string | null;
  adminTokenExpiresAt: string | null;
}

/**
 * Live PIN check against the Tally API. Local SQLite never sees the PIN or
 * the hash at unlock time — that is what `/pos/cashiers/verify-pin` is for.
 *
 * The endpoint answers with a bare `false` for every failure: wrong digits,
 * no PIN set, or a caller whose role is not terminal/admin. The role is
 * probed on failure to tell the three apart, same as the old verify_pin()
 * flow.
 */
export async function verifyPin(userId: string, pin: string): Promise<PinUnlock> {
  await ensureFreshSession();
  const client = getApiClient();

  const outcome = await verifyCashierPin(client, { userId, pin });
  if (outcome.verified) {
    return { result: "ok", adminToken: outcome.adminToken, adminTokenExpiresAt: outcome.adminTokenExpiresAt };
  }

  const profile = await me(client);
  const result = profile.role !== ROLES.TERMINAL && profile.role !== ROLES.ADMIN ? "terminal-not-authorized" : "wrong-pin";
  return { result, adminToken: null, adminTokenExpiresAt: null };
}
