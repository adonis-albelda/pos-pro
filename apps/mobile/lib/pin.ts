import * as Crypto from "expo-crypto";
import { me, verifyCashierPin } from "@double-a/api-client/queries";
import { ROLES } from "@double-a/shared-types";
import { getLocalPinHash, setLocalPinHash } from "@/db/users";
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
  /**
   * Set for every other verified cashier — narrower, self-service-only
   * token (change my own PIN/password). See VerifyCashierPinController.
   */
  cashierToken: string | null;
  cashierTokenExpiresAt: string | null;
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
    return {
      result: "ok",
      adminToken: outcome.adminToken,
      adminTokenExpiresAt: outcome.adminTokenExpiresAt,
      cashierToken: outcome.cashierToken,
      cashierTokenExpiresAt: outcome.cashierTokenExpiresAt,
    };
  }

  const profile = await me(client);
  const result = profile.role !== ROLES.TERMINAL && profile.role !== ROLES.ADMIN ? "terminal-not-authorized" : "wrong-pin";
  return { result, adminToken: null, adminTokenExpiresAt: null, cashierToken: null, cashierTokenExpiresAt: null };
}

/**
 * Offline idle-relock cache, deliberately scoped away from live login/unlock
 * above. Same salted scheme as the server's own CashierPinHasher
 * (sha256("double-a-pin:{id}:{pin}")) — not because this hash is ever
 * compared against the server's, but so the two never drift into two
 * different "the PIN hash" concepts on the same device.
 *
 * A 4-6 digit PIN is a small enough space that any hash of it is crackable
 * with a bit of local compute — the real boundary here is the same one that
 * protects the rest of a locked terminal: whoever has the device's own
 * SQLite file already has the terminal. This exists only to let idle-lock
 * relock survive a dead connection mid-shift (CLAUDE.md §1's live-only rule
 * still governs the two things that actually leave the device: shift-start
 * unlock in app/unlock.tsx, and PIN changes below).
 */
async function hashPinLocally(userId: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `double-a-pin:${userId}:${pin}`);
}

/** Called after a live-verified PIN succeeds (unlock, or a PIN change) — see hashPinLocally's own comment. */
export async function cacheLocalPin(userId: string, pin: string): Promise<void> {
  const hash = await hashPinLocally(userId, pin);
  await setLocalPinHash(userId, hash);
}

/**
 * Offline idle-relock check. `null` means this device has never cached a PIN
 * for this cashier this install (a fresh install, or one that's never had a
 * live unlock yet) — the caller falls back to the live path in that case,
 * same as always.
 */
export async function verifyPinLocally(userId: string, pin: string): Promise<boolean | null> {
  const stored = await getLocalPinHash(userId);
  if (!stored) return null;
  const candidate = await hashPinLocally(userId, pin);
  return candidate === stored;
}
