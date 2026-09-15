import type { User } from "@double-a/shared-types";
import type { WriteProgress } from "./products";
import { getDb } from "./index";

async function insertOrReplaceUser(db: ReturnType<typeof getDb>, user: User): Promise<void> {
  await db.runAsync(
    `INSERT INTO users (id, name, email, role, pin_hash, is_active, can_sell, idle_timeout_minutes, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       email = excluded.email,
       role = excluded.role,
       is_active = excluded.is_active,
       can_sell = excluded.can_sell,
       idle_timeout_minutes = excluded.idle_timeout_minutes,
       updated_at = excluded.updated_at`,
    user.id,
    user.name,
    user.email,
    user.role,
    user.isActive ? 1 : 0,
    user.canSell ? 1 : 0,
    user.idleTimeoutMinutes,
    user.updatedAt,
  );
}

/**
 * Local users mirror for sale attribution after unlock. Credentials never
 * checked here — unlock uses live verify_pin.
 */
export async function upsertUsers(users: User[], onProgress?: WriteProgress): Promise<void> {
  if (users.length === 0) return;

  const db = getDb();
  await db.withTransactionAsync(async () => {
    for (const [index, user] of users.entries()) {
      await insertOrReplaceUser(db, user);
      onProgress?.(index + 1, users.length);
    }
  });
}

/** Wholesale replace — same "Replace everything" action as replaceProducts(). */
export async function replaceUsers(users: User[], onProgress?: WriteProgress): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync("DELETE FROM users;");
    for (const [index, user] of users.entries()) {
      await insertOrReplaceUser(db, user);
      onProgress?.(index + 1, users.length);
    }
  });
}

export async function countLocalUsers(): Promise<number> {
  const row = await getDb().getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM users",
  );
  return row?.count ?? 0;
}

/**
 * Offline idle-relock cache (lib/pin.ts) — the ONE place local SQLite is
 * allowed to hold PIN material, and only ever a locally-computed hash, never
 * the server's own. `insertOrReplaceUser`'s ON CONFLICT clause deliberately
 * omits pin_hash, so a normal (upsert) pull never touches whatever this
 * device already cached here — only a brand-new row (first INSERT for that
 * user id) or a full "Replace everything" Sync (replaceUsers' DELETE+INSERT)
 * resets it to NULL. Set right after a live-verified PIN (shift-start
 * unlock, or a successful PIN change) so an idle relock mid-shift can check
 * a PIN without a network call.
 */
export async function setLocalPinHash(userId: string, hash: string | null): Promise<void> {
  await getDb().runAsync("UPDATE users SET pin_hash = ? WHERE id = ?", hash, userId);
}

export async function getLocalPinHash(userId: string): Promise<string | null> {
  const row = await getDb().getFirstAsync<{ pin_hash: string | null }>(
    "SELECT pin_hash FROM users WHERE id = ?",
    userId,
  );
  return row?.pin_hash ?? null;
}
