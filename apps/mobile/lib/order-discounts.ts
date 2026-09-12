/**
 * POS helpers for applying simple discount rules and evaluating complex promos
 * against the live cart — keeps heavy logic out of the giant pos/index.tsx.
 */

import * as Crypto from "expo-crypto";
import {
  applyComplexDiscountReward,
  blocksComplexPromo,
  cartTotal,
  computeSimpleDiscount,
  eligibleRewards,
  evaluateComplexDiscount,
  lineSubtotal,
  type CartLine,
  type ComplexDiscountRule,
  type DiscountCartSnapshot,
  type DiscountRule,
  type LoyaltyReward,
  type SaleDiscount,
  type TaxSettings,
} from "@double-a/shared-types";

export type AppliedOrderDiscount = Omit<SaleDiscount, "saleId">;

export function buildCartSnapshot(lines: CartLine[]): DiscountCartSnapshot {
  const productQuantities: Record<string, number> = {};
  const variantQuantities: Record<string, number> = {};
  const categoryQuantities: Record<string, number> = {};

  for (const line of lines) {
    productQuantities[line.productId] = (productQuantities[line.productId] ?? 0) + line.quantity;
    if (line.variantId) {
      variantQuantities[line.variantId] = (variantQuantities[line.variantId] ?? 0) + line.quantity;
    }
    if (line.categoryId) {
      categoryQuantities[line.categoryId] =
        (categoryQuantities[line.categoryId] ?? 0) + line.quantity;
    }
  }

  return {
    total: cartTotal(lines),
    productQuantities,
    variantQuantities,
    categoryQuantities,
  };
}

/** Whether this cart line sits inside a simple rule's scope. */
export function lineMatchesDiscountRule(line: CartLine, rule: DiscountRule): boolean {
  if (!rule.isActive) return false;
  if (rule.appliesTo === "total") return true;

  if (rule.appliesTo === "specific_products") {
    return rule.scopes.some((scope) => {
      if (scope.scopeType === "product") return scope.scopeId === line.productId;
      if (scope.scopeType === "variant") return scope.scopeId === line.variantId;
      return false;
    });
  }

  if (rule.appliesTo === "specific_categories") {
    if (!line.categoryId) return false;
    return rule.scopes.some(
      (scope) => scope.scopeType === "category" && scope.scopeId === line.categoryId,
    );
  }

  return false;
}

/** Peso base a simple rule should compute against for this cart. */
export function applicableAmountForRule(rule: DiscountRule, lines: CartLine[]): number {
  const matching = lines.filter((line) => lineMatchesDiscountRule(line, rule));
  return matching.reduce((sum, line) => sum + lineSubtotal(line.unitPrice, line.quantity), 0);
}

/**
 * Active simple rules that touch at least one line in the cart — catalog
 * discounts the cashier can pick by hand. `total` rules always qualify when
 * the cart is non-empty; scoped rules need a matching product/category/variant.
 */
export function qualifyingSimpleRules(rules: DiscountRule[], lines: CartLine[]): DiscountRule[] {
  if (lines.length === 0) return [];
  return rules.filter((rule) => {
    if (!rule.isActive) return false;
    if (rule.appliesTo === "total") return true;
    return lines.some((line) => lineMatchesDiscountRule(line, rule));
  });
}

export function applySimpleRuleToCart(options: {
  rule: DiscountRule;
  lines: CartLine[];
  tax: TaxSettings;
  idNumber?: string | null;
  idHolderName?: string | null;
  appliedBy?: string | null;
}): AppliedOrderDiscount {
  const { rule, lines, tax, idNumber, idHolderName, appliedBy } = options;
  const applicable = applicableAmountForRule(rule, lines);
  const result = computeSimpleDiscount(rule, applicable, tax);

  return {
    id: Crypto.randomUUID(),
    discountRuleId: rule.id,
    complexDiscountRuleId: null,
    name: rule.name,
    idNumber: idNumber ?? null,
    idHolderName: idHolderName ?? null,
    discountAmount: result.discountAmount,
    vatRemoved: result.vatRemoved ?? null,
    isVatExempt: rule.isVatExempt,
    appliedBy: appliedBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Loyalty rewards the cashier can pick right now: the customer's points
 * balance clears the threshold (spec section 4) AND the reward's linked
 * Simple Discount would itself qualify for this cart (spec section 13 point
 * 5 — a reward never bypasses the discount's own scope rules). Loyalty only
 * decides the first half; qualifyingSimpleRules still decides the second.
 */
export function eligibleLoyaltyRewards(options: {
  rewards: LoyaltyReward[];
  discountRules: DiscountRule[];
  pointsBalance: number;
  lines: CartLine[];
}): { reward: LoyaltyReward; rule: DiscountRule }[] {
  const { rewards, discountRules, pointsBalance, lines } = options;
  const rulesById = new Map(discountRules.map((rule) => [rule.id, rule]));
  const qualifying = new Set(qualifyingSimpleRules(discountRules, lines).map((rule) => rule.id));

  return eligibleRewards(rewards, pointsBalance)
    .map((reward) => ({ reward, rule: rulesById.get(reward.simpleDiscountId) }))
    .filter((entry): entry is { reward: LoyaltyReward; rule: DiscountRule } =>
      Boolean(entry.rule) && entry.rule!.isActive && qualifying.has(entry.rule!.id),
    );
}

/** Same math as applySimpleRuleToCart, tagged as a loyalty redemption so it can carry a points deduction on push. */
export function applyLoyaltyRewardToCart(options: {
  reward: LoyaltyReward;
  rule: DiscountRule;
  lines: CartLine[];
  tax: TaxSettings;
  appliedBy?: string | null;
}): AppliedOrderDiscount {
  const { reward, appliedBy, ...rest } = options;
  return {
    ...applySimpleRuleToCart({ ...rest, appliedBy }),
    loyaltyRewardId: reward.id,
  };
}

export function qualifyingComplexRules(
  rules: ComplexDiscountRule[],
  lines: CartLine[],
  existing: AppliedOrderDiscount[],
): ComplexDiscountRule[] {
  if (blocksComplexPromo(existing)) return [];
  const cart = buildCartSnapshot(lines);
  return rules.filter((rule) => evaluateComplexDiscount(rule, cart));
}

export function applyComplexRuleToCart(options: {
  rule: ComplexDiscountRule;
  lines: CartLine[];
  appliedBy?: string | null;
}): AppliedOrderDiscount {
  const { rule, lines, appliedBy } = options;
  const reward = applyComplexDiscountReward(rule, cartTotal(lines));

  return {
    id: Crypto.randomUUID(),
    discountRuleId: null,
    complexDiscountRuleId: rule.id,
    name: rule.name,
    idNumber: null,
    idHolderName: null,
    discountAmount: reward.discountAmount,
    vatRemoved: null,
    isVatExempt: false,
    appliedBy: appliedBy ?? null,
    createdAt: new Date().toISOString(),
  };
}

export function orderDiscountImpact(discounts: AppliedOrderDiscount[]): number {
  return discounts.reduce((sum, d) => sum + d.discountAmount + (d.vatRemoved ?? 0), 0);
}
