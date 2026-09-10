import type {
  ComplexDiscountCondition,
  ComplexDiscountRule,
  DiscountRule,
  DiscountRuleScope,
  SaleDiscount,
  TaxSettings,
} from "@double-a/shared-types";
import { DEFAULT_TAX_SETTINGS } from "@double-a/shared-types";
import { getDb } from "./index";

interface DiscountRuleRow {
  id: string;
  name: string;
  type: string;
  value: number;
  applies_to: string;
  requires_id_number: number;
  is_vat_exempt: number;
  is_system_protected: number;
  is_active: number;
  scopes_json: string;
}

interface ComplexRuleRow {
  id: string;
  name: string;
  reward_type: string;
  reward_value: number | null;
  reward_free_variant_id: string | null;
  condition_logic: string;
  is_active: number;
  starts_at: string | null;
  ends_at: string | null;
  conditions_json: string;
}

interface TaxSettingsRow {
  is_vat_registered: number;
  vat_rate: number;
  auto_apply_complex_discounts: number;
}

interface SaleDiscountRow {
  id: string;
  sale_id: string;
  discount_rule_id: string | null;
  complex_discount_rule_id: string | null;
  name: string | null;
  id_number: string | null;
  id_holder_name: string | null;
  discount_amount: number;
  vat_removed: number | null;
  is_vat_exempt: number;
  applied_by: string | null;
  created_at: string;
}

function parseScopes(json: string): DiscountRuleScope[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as DiscountRuleScope[]) : [];
  } catch {
    return [];
  }
}

function parseConditions(json: string): ComplexDiscountCondition[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as ComplexDiscountCondition[]) : [];
  } catch {
    return [];
  }
}

function toDiscountRule(row: DiscountRuleRow): DiscountRule {
  return {
    id: row.id,
    name: row.name,
    type: row.type as DiscountRule["type"],
    value: row.value,
    appliesTo: row.applies_to as DiscountRule["appliesTo"],
    requiresIdNumber: row.requires_id_number === 1,
    isVatExempt: row.is_vat_exempt === 1,
    isSystemProtected: row.is_system_protected === 1,
    isActive: row.is_active === 1,
    scopes: parseScopes(row.scopes_json),
  };
}

function toComplexRule(row: ComplexRuleRow): ComplexDiscountRule {
  return {
    id: row.id,
    name: row.name,
    rewardType: row.reward_type as ComplexDiscountRule["rewardType"],
    rewardValue: row.reward_value,
    rewardFreeVariantId: row.reward_free_variant_id,
    conditionLogic: row.condition_logic as ComplexDiscountRule["conditionLogic"],
    isActive: row.is_active === 1,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    conditions: parseConditions(row.conditions_json),
  };
}

export function toSaleDiscount(row: SaleDiscountRow): SaleDiscount {
  return {
    id: row.id,
    saleId: row.sale_id,
    discountRuleId: row.discount_rule_id,
    complexDiscountRuleId: row.complex_discount_rule_id,
    name: row.name,
    idNumber: row.id_number,
    idHolderName: row.id_holder_name,
    discountAmount: row.discount_amount,
    vatRemoved: row.vat_removed,
    isVatExempt: row.is_vat_exempt === 1,
    appliedBy: row.applied_by,
    createdAt: row.created_at,
  };
}

/** Whole-replace — deactivated rules must leave the device. */
export async function replaceDiscountRules(rules: DiscountRule[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM discount_rules");
    for (const rule of rules) {
      await db.runAsync(
        `INSERT INTO discount_rules
           (id, name, type, value, applies_to, requires_id_number, is_vat_exempt,
            is_system_protected, is_active, scopes_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        rule.id,
        rule.name,
        rule.type,
        rule.value,
        rule.appliesTo,
        rule.requiresIdNumber ? 1 : 0,
        rule.isVatExempt ? 1 : 0,
        rule.isSystemProtected ? 1 : 0,
        rule.isActive ? 1 : 0,
        JSON.stringify(rule.scopes),
      );
    }
  });
}

export async function replaceComplexDiscountRules(rules: ComplexDiscountRule[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM complex_discount_rules");
    for (const rule of rules) {
      await db.runAsync(
        `INSERT INTO complex_discount_rules
           (id, name, reward_type, reward_value, reward_free_variant_id, condition_logic,
            is_active, starts_at, ends_at, conditions_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        rule.id,
        rule.name,
        rule.rewardType,
        rule.rewardValue,
        rule.rewardFreeVariantId,
        rule.conditionLogic,
        rule.isActive ? 1 : 0,
        rule.startsAt,
        rule.endsAt,
        JSON.stringify(rule.conditions),
      );
    }
  });
}

/**
 * The realtime write (sync/realtime.ts) — one rule at a time, unlike
 * replaceDiscountRules's whole-table drop-and-reinsert from a pull. A
 * no-op-safe upsert-by-id, same shape as db/products.ts's own upsert. A
 * rule an admin actually deletes (rather than deactivates) arrives as its
 * own `.discount-rule.deleted` event instead — see deleteLocalDiscountRule.
 */
export async function upsertLocalDiscountRule(rule: DiscountRule): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO discount_rules
       (id, name, type, value, applies_to, requires_id_number, is_vat_exempt,
        is_system_protected, is_active, scopes_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       type = excluded.type,
       value = excluded.value,
       applies_to = excluded.applies_to,
       requires_id_number = excluded.requires_id_number,
       is_vat_exempt = excluded.is_vat_exempt,
       is_system_protected = excluded.is_system_protected,
       is_active = excluded.is_active,
       scopes_json = excluded.scopes_json`,
    rule.id,
    rule.name,
    rule.type,
    rule.value,
    rule.appliesTo,
    rule.requiresIdNumber ? 1 : 0,
    rule.isVatExempt ? 1 : 0,
    rule.isSystemProtected ? 1 : 0,
    rule.isActive ? 1 : 0,
    JSON.stringify(rule.scopes),
  );
}

export async function deleteLocalDiscountRule(id: string): Promise<void> {
  await getDb().runAsync("DELETE FROM discount_rules WHERE id = ?", id);
}

/** Realtime counterpart to replaceComplexDiscountRules — see upsertLocalDiscountRule's own comment. */
export async function upsertLocalComplexDiscountRule(rule: ComplexDiscountRule): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO complex_discount_rules
       (id, name, reward_type, reward_value, reward_free_variant_id, condition_logic,
        is_active, starts_at, ends_at, conditions_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       reward_type = excluded.reward_type,
       reward_value = excluded.reward_value,
       reward_free_variant_id = excluded.reward_free_variant_id,
       condition_logic = excluded.condition_logic,
       is_active = excluded.is_active,
       starts_at = excluded.starts_at,
       ends_at = excluded.ends_at,
       conditions_json = excluded.conditions_json`,
    rule.id,
    rule.name,
    rule.rewardType,
    rule.rewardValue,
    rule.rewardFreeVariantId,
    rule.conditionLogic,
    rule.isActive ? 1 : 0,
    rule.startsAt,
    rule.endsAt,
    JSON.stringify(rule.conditions),
  );
}

export async function deleteLocalComplexDiscountRule(id: string): Promise<void> {
  await getDb().runAsync("DELETE FROM complex_discount_rules WHERE id = ?", id);
}

export async function listLocalDiscountRules(): Promise<DiscountRule[]> {
  const rows = await getDb().getAllAsync<DiscountRuleRow>(
    "SELECT * FROM discount_rules WHERE is_active = 1 ORDER BY is_system_protected DESC, name",
  );
  return rows.map(toDiscountRule);
}

export async function listLocalComplexDiscountRules(): Promise<ComplexDiscountRule[]> {
  const rows = await getDb().getAllAsync<ComplexRuleRow>(
    "SELECT * FROM complex_discount_rules WHERE is_active = 1 ORDER BY name",
  );
  return rows.map(toComplexRule);
}

export async function saveLocalTaxSettings(settings: TaxSettings): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO tax_settings (id, is_vat_registered, vat_rate, auto_apply_complex_discounts)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       is_vat_registered = excluded.is_vat_registered,
       vat_rate = excluded.vat_rate,
       auto_apply_complex_discounts = excluded.auto_apply_complex_discounts`,
    settings.isVatRegistered ? 1 : 0,
    settings.vatRate,
    settings.autoApplyComplexDiscounts ? 1 : 0,
  );
}

export async function getLocalTaxSettings(): Promise<TaxSettings> {
  const row = await getDb().getFirstAsync<TaxSettingsRow>("SELECT * FROM tax_settings WHERE id = 1");
  if (!row) return DEFAULT_TAX_SETTINGS;
  return {
    isVatRegistered: row.is_vat_registered === 1,
    vatRate: row.vat_rate,
    autoApplyComplexDiscounts: row.auto_apply_complex_discounts === 1,
  };
}

export async function insertSaleDiscounts(discounts: SaleDiscount[]): Promise<void> {
  if (discounts.length === 0) return;
  const db = getDb();
  for (const d of discounts) {
    await db.runAsync(
      `INSERT INTO sale_discounts
         (id, sale_id, discount_rule_id, complex_discount_rule_id, name, id_number, id_holder_name,
          discount_amount, vat_removed, is_vat_exempt, applied_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      d.id,
      d.saleId,
      d.discountRuleId,
      d.complexDiscountRuleId,
      d.name ?? null,
      d.idNumber,
      d.idHolderName,
      d.discountAmount,
      d.vatRemoved,
      d.isVatExempt ? 1 : 0,
      d.appliedBy,
      d.createdAt,
    );
  }
}

export async function listSaleDiscountsForSales(saleIds: string[]): Promise<Map<string, SaleDiscount[]>> {
  const map = new Map<string, SaleDiscount[]>();
  if (saleIds.length === 0) return map;
  const placeholders = saleIds.map(() => "?").join(", ");
  const rows = await getDb().getAllAsync<SaleDiscountRow>(
    `SELECT * FROM sale_discounts WHERE sale_id IN (${placeholders})`,
    ...saleIds,
  );
  for (const row of rows) {
    const list = map.get(row.sale_id) ?? [];
    list.push(toSaleDiscount(row));
    map.set(row.sale_id, list);
  }
  return map;
}
