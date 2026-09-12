/**
 * Loyalty program — points ledger + rewards that reference an existing
 * Simple Discount (discounts.ts). Loyalty decides eligibility only; the
 * discount's own type/value/scopes still come from DiscountRule.
 */

export type LoyaltyLedgerEntryType = "purchase" | "bonus" | "redemption" | "adjustment" | "expiration";

/** Settings only — three columns on `companies`, not a row-backed resource of its own. */
export interface LoyaltyProgram {
  name: string;
  isActive: boolean;
  pointsPerCurrency: number;
}

export const DEFAULT_LOYALTY_PROGRAM: LoyaltyProgram = {
  name: "",
  isActive: false,
  pointsPerCurrency: 1,
};

/** References an existing DiscountRule by id — never its own copy of type/value/scopes. */
export interface LoyaltyReward {
  id: string;
  companyId: string;
  name: string;
  pointsRequired: number;
  simpleDiscountId: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoyaltyLedgerEntry {
  id: string;
  companyId: string;
  customerId: string;
  points: number;
  type: LoyaltyLedgerEntryType;
  saleId: string | null;
  loyaltyRewardId: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** Points earned for a completed sale, at the program's configured rate. */
export function computeEarnedPoints(program: Pick<LoyaltyProgram, "pointsPerCurrency">, saleTotal: number): number {
  if (saleTotal <= 0) return 0;
  return Math.floor(saleTotal * program.pointsPerCurrency);
}

/** Whether a customer's points balance clears a reward's threshold. */
export function isRewardEligible(reward: Pick<LoyaltyReward, "isActive" | "pointsRequired">, pointsBalance: number): boolean {
  return reward.isActive && pointsBalance >= reward.pointsRequired;
}

/** Rewards a customer currently qualifies for, active-only, cheapest-first. */
export function eligibleRewards(rewards: LoyaltyReward[], pointsBalance: number): LoyaltyReward[] {
  return rewards
    .filter((reward) => isRewardEligible(reward, pointsBalance))
    .sort((a, b) => a.pointsRequired - b.pointsRequired);
}
