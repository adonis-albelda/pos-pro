import type { LoyaltyProgram, LoyaltyReward } from "@double-a/shared-types";
import { DEFAULT_LOYALTY_PROGRAM } from "@double-a/shared-types";
import { getDb } from "./index";

interface LoyaltySettingsRow {
  loyalty_enabled: number;
  loyalty_points_per_currency: number;
  loyalty_program_name: string | null;
}

/** Local column names mirror the wire attrs (LoyaltySettingsAttrs), same as tax_settings. */
export async function saveLocalLoyaltyProgram(program: LoyaltyProgram): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO loyalty_settings (id, loyalty_enabled, loyalty_points_per_currency, loyalty_program_name)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       loyalty_enabled = excluded.loyalty_enabled,
       loyalty_points_per_currency = excluded.loyalty_points_per_currency,
       loyalty_program_name = excluded.loyalty_program_name`,
    program.isActive ? 1 : 0,
    program.pointsPerCurrency,
    program.name || null,
  );
}

export async function getLocalLoyaltyProgram(): Promise<LoyaltyProgram> {
  const row = await getDb().getFirstAsync<LoyaltySettingsRow>("SELECT * FROM loyalty_settings WHERE id = 1");
  if (!row) return DEFAULT_LOYALTY_PROGRAM;
  return {
    isActive: row.loyalty_enabled === 1,
    pointsPerCurrency: row.loyalty_points_per_currency,
    name: row.loyalty_program_name ?? "",
  };
}

interface LoyaltyRewardRow {
  id: string;
  name: string;
  points_required: number;
  simple_discount_id: string;
  is_active: number;
}

function toLoyaltyReward(row: LoyaltyRewardRow): LoyaltyReward {
  return {
    id: row.id,
    companyId: "",
    name: row.name,
    pointsRequired: row.points_required,
    simpleDiscountId: row.simple_discount_id,
    isActive: row.is_active === 1,
  };
}

/** Whole-replace, same as replaceDiscountRules — a deactivated/deleted reward must leave the device. */
export async function replaceLoyaltyRewards(rewards: LoyaltyReward[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM loyalty_rewards");
    for (const reward of rewards) {
      await db.runAsync(
        `INSERT INTO loyalty_rewards (id, name, points_required, simple_discount_id, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        reward.id,
        reward.name,
        reward.pointsRequired,
        reward.simpleDiscountId,
        reward.isActive ? 1 : 0,
      );
    }
  });
}

/** Realtime counterpart to replaceLoyaltyRewards — see db/discounts.ts's upsertLocalDiscountRule for the same one-row-at-a-time reasoning. */
export async function upsertLocalLoyaltyReward(reward: LoyaltyReward): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO loyalty_rewards (id, name, points_required, simple_discount_id, is_active)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       points_required = excluded.points_required,
       simple_discount_id = excluded.simple_discount_id,
       is_active = excluded.is_active`,
    reward.id,
    reward.name,
    reward.pointsRequired,
    reward.simpleDiscountId,
    reward.isActive ? 1 : 0,
  );
}

export async function deleteLocalLoyaltyReward(id: string): Promise<void> {
  await getDb().runAsync("DELETE FROM loyalty_rewards WHERE id = ?", id);
}

export async function listLocalLoyaltyRewards(): Promise<LoyaltyReward[]> {
  const rows = await getDb().getAllAsync<LoyaltyRewardRow>(
    "SELECT * FROM loyalty_rewards WHERE is_active = 1 ORDER BY points_required",
  );
  return rows.map(toLoyaltyReward);
}

/**
 * Points already spent by this customer's not-yet-pushed sales. The synced
 * loyalty_points_balance on customers is only as fresh as the last pull —
 * same staleness as estimated_stock (CLAUDE.md rule 2) — so a second
 * redemption attempted before syncing subtracts what's already pending
 * instead of re-reading a balance that hasn't caught up yet.
 */
export async function getPendingRedeemedPoints(customerId: string): Promise<number> {
  const row = await getDb().getFirstAsync<{ total: number | null }>(
    `SELECT SUM(r.points_required) AS total
       FROM sale_discounts sd
       JOIN sales s ON s.id = sd.sale_id
       JOIN loyalty_rewards r ON r.id = sd.loyalty_reward_id
      WHERE s.customer_id = ?
        AND s.sync_status = 'pending'
        AND sd.loyalty_reward_id IS NOT NULL`,
    customerId,
  );
  return row?.total ?? 0;
}
