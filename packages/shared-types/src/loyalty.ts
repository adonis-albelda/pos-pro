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

export type LoyaltyEarningConditionOperator = ">=" | ">" | "=" | "<=" | "<";
export type LoyaltyEarningRewardType = "fixed_points" | "percentage";

/**
 * One condition-based earning tier — replaces LoyaltyProgram's flat
 * pointsPerCurrency rate once any rule exists for the company. "Under 100
 * → 1 pt (auto)", "exactly 500 → 5 pts (auto)", "over 1000 → 2% (cashier
 * confirms)" are three separate rules, matched against a sale's total by
 * operator/threshold — same shape as ComplexDiscountCondition's own
 * total_amount condition, just for earning instead of discounting.
 */
export interface LoyaltyEarningRule {
  id: string;
  companyId: string;
  conditionOperator: LoyaltyEarningConditionOperator;
  thresholdAmount: number;
  rewardType: LoyaltyEarningRewardType;
  rewardValue: number;
  /** false = a cashier must confirm the award (see the sale's own "award points" action) — never auto-credited. */
  isAuto: boolean;
  isActive: boolean;
  /** Lowest wins when a sale's total matches more than one active rule. */
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Points this rule would award for a sale of this total — mirrors LoyaltyEarningRule::pointsFor (PHP), floored, never negative. */
export function pointsForEarningRule(
  rule: Pick<LoyaltyEarningRule, "rewardType" | "rewardValue">,
  total: number,
): number {
  const points = "percentage" === rule.rewardType ? total * (rule.rewardValue / 100) : rule.rewardValue;
  return Math.max(0, Math.floor(points));
}

/** Whether a sale of this total meets this rule's condition — mirrors LoyaltyEarningRule::matches (PHP). */
export function earningRuleMatches(
  rule: Pick<LoyaltyEarningRule, "conditionOperator" | "thresholdAmount">,
  total: number,
): boolean {
  switch (rule.conditionOperator) {
    case ">=":
      return total >= rule.thresholdAmount;
    case ">":
      return total > rule.thresholdAmount;
    case "=":
      return total === rule.thresholdAmount;
    case "<=":
      return total <= rule.thresholdAmount;
    case "<":
      return total < rule.thresholdAmount;
  }
}

/** The active rule (lowest sortOrder first) whose condition this total satisfies, if any — mirrors RecordLoyaltyForSaleAction::matchingRule (PHP). */
export function matchingEarningRule(rules: LoyaltyEarningRule[], total: number): LoyaltyEarningRule | null {
  const sorted = [...rules]
    .filter((rule) => rule.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.find((rule) => earningRuleMatches(rule, total)) ?? null;
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
