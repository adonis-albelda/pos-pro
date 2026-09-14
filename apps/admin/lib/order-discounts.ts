/**
 * Web admin port of the mobile POS's own order-discount helpers
 * (apps/mobile/lib/order-discounts.ts) — same algorithm, reusing the same
 * shared-types primitives (computeSimpleDiscount, evaluateComplexDiscount,
 * eligibleRewards, ...); only the id source differs (crypto.randomUUID()
 * here vs expo-crypto on-device, since a client id is a mobile-only
 * requirement — CLAUDE.md rule 3 — this admin sale is server-assigned
 * either way).
 */

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
      categoryQuantities[line.categoryId] = (categoryQuantities[line.categoryId] ?? 0) + line.quantity;
    }
  }

  return { total: cartTotal(lines), productQuantities, variantQuantities, categoryQuantities };
}

function lineMatchesDiscountRule(line: CartLine, rule: DiscountRule): boolean {
  if (!rule.isActive) return false;
  if ("total" === rule.appliesTo) return true;

  if ("specific_products" === rule.appliesTo) {
    return rule.scopes.some((scope) => {
      if ("product" === scope.scopeType) return scope.scopeId === line.productId;
      if ("variant" === scope.scopeType) return scope.scopeId === line.variantId;
      return false;
    });
  }

  if ("specific_categories" === rule.appliesTo) {
    if (!line.categoryId) return false;
    return rule.scopes.some((scope) => "category" === scope.scopeType && scope.scopeId === line.categoryId);
  }

  return false;
}

function applicableAmountForRule(rule: DiscountRule, lines: CartLine[]): number {
  const matching = lines.filter((line) => lineMatchesDiscountRule(line, rule));
  return matching.reduce((sum, line) => sum + lineSubtotal(line.unitPrice, line.quantity), 0);
}

/** Active simple rules that touch at least one line in the cart — catalog discounts the cashier can pick by hand. */
export function qualifyingSimpleRules(rules: DiscountRule[], lines: CartLine[]): DiscountRule[] {
  if (0 === lines.length) return [];
  return rules.filter((rule) => {
    if (!rule.isActive) return false;
    if ("total" === rule.appliesTo) return true;
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
    id: crypto.randomUUID(),
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

/** Loyalty rewards the cashier can pick right now — points balance clears the threshold AND the linked discount would itself qualify for this cart. */
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
      Boolean(entry.rule) && true === entry.rule?.isActive && qualifying.has(entry.rule.id),
    );
}

export function applyLoyaltyRewardToCart(options: {
  reward: LoyaltyReward;
  rule: DiscountRule;
  lines: CartLine[];
  tax: TaxSettings;
  appliedBy?: string | null;
}): AppliedOrderDiscount {
  const { reward, appliedBy, ...rest } = options;
  return { ...applySimpleRuleToCart({ ...rest, appliedBy }), loyaltyRewardId: reward.id };
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
    id: crypto.randomUUID(),
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
