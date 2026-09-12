/**
 * Simple + complex discount rules, VAT-aware computation, and sale audit rows.
 *
 * Stacking policy: a VAT-exempt (Senior/PWD) simple discount never stacks with
 * a complex promo on the same sale. Counter line discounts (list − unit) are
 * separate and still recorded on sale_items.
 */

import { roundMoney } from "./money";

export type DiscountRuleType = "percentage" | "fixed_amount";
export type DiscountAppliesTo = "total" | "specific_categories" | "specific_products";
export type DiscountScopeType = "category" | "product" | "variant";

export type ComplexRewardType = "percentage" | "fixed_amount" | "free_item";
export type ComplexConditionLogic = "all" | "any";
export type ComplexConditionType =
  | "total_amount"
  | "product_quantity"
  | "variant_quantity"
  | "category_quantity";
export type ComplexOperator = ">=" | ">" | "=" | "<=" | "<";

export interface DiscountRuleScope {
  id: string;
  scopeType: DiscountScopeType;
  scopeId: string;
}

/** Cashier-selected discount (Senior/PWD, Employee, custom). */
export interface DiscountRule {
  id: string;
  name: string;
  type: DiscountRuleType;
  value: number;
  appliesTo: DiscountAppliesTo;
  requiresIdNumber: boolean;
  isVatExempt: boolean;
  isSystemProtected: boolean;
  isActive: boolean;
  scopes: DiscountRuleScope[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ComplexDiscountCondition {
  id: string;
  conditionType: ComplexConditionType;
  targetId: string | null;
  operator: ComplexOperator;
  thresholdValue: number;
}

/** Condition-based promo — never VAT-exempt. */
export interface ComplexDiscountRule {
  id: string;
  name: string;
  rewardType: ComplexRewardType;
  rewardValue: number | null;
  rewardFreeVariantId: string | null;
  conditionLogic: ComplexConditionLogic;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  conditions: ComplexDiscountCondition[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TaxSettings {
  isVatRegistered: boolean;
  vatRate: number;
  autoApplyComplexDiscounts: boolean;
}

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  isVatRegistered: false,
  vatRate: 12,
  autoApplyComplexDiscounts: true,
};

/** One applied discount on a sale (pushed with the sale header). */
export interface SaleDiscount {
  id: string;
  saleId: string;
  discountRuleId: string | null;
  complexDiscountRuleId: string | null;
  /** Set when this discount is a loyalty reward redemption, not a plain rule pick. */
  loyaltyRewardId?: string | null;
  /** Rule name snapshotted for receipts after a rename. */
  name?: string | null;
  idNumber: string | null;
  idHolderName: string | null;
  discountAmount: number;
  vatRemoved: number | null;
  /** Client-side hint for stacking validation on push. */
  isVatExempt?: boolean;
  appliedBy: string | null;
  createdAt: string;
}

export interface SimpleDiscountResult {
  discountAmount: number;
  finalAmount: number;
  vatExclusiveAmount?: number;
  vatRemoved?: number;
}

export interface ComplexRewardResult {
  discountAmount: number;
  freeVariantId?: string | null;
}

/** Cart shape complex rules evaluate against (live POS cart). */
export interface DiscountCartSnapshot {
  total: number;
  /** productId → qty */
  productQuantities: Record<string, number>;
  /** variantId → qty */
  variantQuantities: Record<string, number>;
  /** categoryId → qty */
  categoryQuantities: Record<string, number>;
}

export function getVatExclusiveAmount(vatInclusiveAmount: number, vatRate: number): number {
  return roundMoney(vatInclusiveAmount / (1 + vatRate / 100));
}

export function getVatAmount(vatInclusiveAmount: number, vatRate: number): number {
  return roundMoney(vatInclusiveAmount - getVatExclusiveAmount(vatInclusiveAmount, vatRate));
}

/**
 * PH Senior/PWD: when VAT-exempt + company VAT-registered, discount applies to
 * the VAT-exclusive base and VAT itself is removed. Never percentage-off the
 * VAT-inclusive sticker price in that case.
 */
export function computeSimpleDiscount(
  rule: Pick<DiscountRule, "type" | "value" | "isVatExempt">,
  applicableAmount: number,
  tax: Pick<TaxSettings, "isVatRegistered" | "vatRate">,
): SimpleDiscountResult {
  if (rule.isVatExempt && tax.isVatRegistered) {
    const vatExclusive = getVatExclusiveAmount(applicableAmount, tax.vatRate);
    const discountAmount =
      rule.type === "percentage"
        ? roundMoney(vatExclusive * (rule.value / 100))
        : Math.min(rule.value, vatExclusive);

    return {
      vatExclusiveAmount: vatExclusive,
      vatRemoved: getVatAmount(applicableAmount, tax.vatRate),
      discountAmount,
      finalAmount: roundMoney(vatExclusive - discountAmount),
    };
  }

  const discountAmount =
    rule.type === "percentage"
      ? roundMoney(applicableAmount * (rule.value / 100))
      : Math.min(rule.value, applicableAmount);

  return {
    discountAmount,
    finalAmount: roundMoney(applicableAmount - discountAmount),
  };
}

function compare(actual: number, operator: ComplexOperator, threshold: number): boolean {
  switch (operator) {
    case ">=":
      return actual >= threshold;
    case ">":
      return actual > threshold;
    case "=":
      return actual === threshold;
    case "<=":
      return actual <= threshold;
    case "<":
      return actual < threshold;
  }
}

export function evaluateComplexDiscount(
  rule: ComplexDiscountRule,
  cart: DiscountCartSnapshot,
  now: Date = new Date(),
): boolean {
  if (!rule.isActive) return false;
  if (rule.startsAt && now < new Date(rule.startsAt)) return false;
  if (rule.endsAt && now > new Date(rule.endsAt)) return false;

  const results = rule.conditions.map((condition) => {
    let actual = 0;
    switch (condition.conditionType) {
      case "total_amount":
        actual = cart.total;
        break;
      case "product_quantity":
        actual = condition.targetId ? (cart.productQuantities[condition.targetId] ?? 0) : 0;
        break;
      case "variant_quantity":
        actual = condition.targetId ? (cart.variantQuantities[condition.targetId] ?? 0) : 0;
        break;
      case "category_quantity":
        actual = condition.targetId ? (cart.categoryQuantities[condition.targetId] ?? 0) : 0;
        break;
    }
    return compare(actual, condition.operator, condition.thresholdValue);
  });

  return rule.conditionLogic === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function applyComplexDiscountReward(
  rule: ComplexDiscountRule,
  cartTotal: number,
): ComplexRewardResult {
  switch (rule.rewardType) {
    case "percentage":
      return { discountAmount: roundMoney(cartTotal * ((rule.rewardValue ?? 0) / 100)) };
    case "fixed_amount":
      return { discountAmount: Math.min(rule.rewardValue ?? 0, cartTotal) };
    case "free_item":
      return { freeVariantId: rule.rewardFreeVariantId, discountAmount: 0 };
  }
}

/** True when a VAT-exempt simple discount is already on the sale — blocks promos. */
export function blocksComplexPromo(discounts: Pick<SaleDiscount, "isVatExempt" | "discountRuleId">[]): boolean {
  return discounts.some((d) => d.discountRuleId != null && d.isVatExempt === true);
}
