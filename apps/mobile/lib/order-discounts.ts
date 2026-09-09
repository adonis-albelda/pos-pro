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
  evaluateComplexDiscount,
  type CartLine,
  type ComplexDiscountRule,
  type DiscountCartSnapshot,
  type DiscountRule,
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

export function applySimpleRuleToCart(options: {
  rule: DiscountRule;
  lines: CartLine[];
  tax: TaxSettings;
  idNumber?: string | null;
  idHolderName?: string | null;
  appliedBy?: string | null;
}): AppliedOrderDiscount {
  const { rule, lines, tax, idNumber, idHolderName, appliedBy } = options;
  const applicable = cartTotal(lines);
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
