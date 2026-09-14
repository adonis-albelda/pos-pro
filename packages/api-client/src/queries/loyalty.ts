import type {
  LoyaltyEarningConditionOperator,
  LoyaltyEarningRewardType,
  LoyaltyEarningRule,
  LoyaltyLedgerEntry,
  LoyaltyLedgerEntryType,
  LoyaltyProgram,
  LoyaltyReward,
} from "@double-a/shared-types";
import type { ApiClient, JsonApiResource } from "../http";

/**
 * Program settings are three plain columns on `companies` server-side
 * (loyalty_enabled/loyalty_points_per_currency/loyalty_program_name) — same
 * shape as tax-settings.ts, not a separate one-row-per-company resource.
 */
export interface LoyaltySettingsAttrs {
  loyalty_enabled: boolean;
  loyalty_points_per_currency: number;
  loyalty_program_name: string | null;
}

export function toLoyaltyProgram(attrs: LoyaltySettingsAttrs): LoyaltyProgram {
  return {
    name: attrs.loyalty_program_name ?? "",
    isActive: attrs.loyalty_enabled,
    pointsPerCurrency: attrs.loyalty_points_per_currency,
  };
}

export async function getLoyaltyProgram(client: ApiClient): Promise<LoyaltyProgram> {
  const { data } = await client.get<{ data: LoyaltySettingsAttrs }>("/loyalty-settings");
  return toLoyaltyProgram(data);
}

export interface UpsertLoyaltyProgramInput {
  name: string;
  isActive?: boolean;
  pointsPerCurrency?: number;
}

export async function saveLoyaltyProgram(
  client: ApiClient,
  input: UpsertLoyaltyProgramInput,
): Promise<LoyaltyProgram> {
  const { data } = await client.patch<{ data: LoyaltySettingsAttrs }>("/loyalty-settings", {
    loyalty_program_name: input.name,
    loyalty_enabled: input.isActive ?? true,
    loyalty_points_per_currency: input.pointsPerCurrency ?? 1,
  });
  return toLoyaltyProgram(data);
}

export interface LoyaltyRewardAttrs {
  name: string;
  points_required: number;
  simple_discount_id: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export function toLoyaltyReward(resource: JsonApiResource<LoyaltyRewardAttrs>): LoyaltyReward {
  const a = resource.attributes;
  return {
    id: resource.id,
    companyId: "",
    name: a.name,
    pointsRequired: a.points_required,
    simpleDiscountId: a.simple_discount_id,
    isActive: a.is_active,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

export async function listLoyaltyRewards(client: ApiClient): Promise<LoyaltyReward[]> {
  const { data } = await client.get<{ data: JsonApiResource<LoyaltyRewardAttrs>[] }>("/loyalty-rewards");
  return data.map(toLoyaltyReward);
}

export interface UpsertLoyaltyRewardInput {
  name: string;
  pointsRequired: number;
  simpleDiscountId: string;
  isActive?: boolean;
}

export async function createLoyaltyReward(
  client: ApiClient,
  input: UpsertLoyaltyRewardInput,
): Promise<LoyaltyReward> {
  const { data } = await client.post<{ data: JsonApiResource<LoyaltyRewardAttrs> }>("/loyalty-rewards", {
    name: input.name,
    points_required: input.pointsRequired,
    simple_discount_id: input.simpleDiscountId,
    is_active: input.isActive ?? true,
  });
  return toLoyaltyReward(data);
}

export async function updateLoyaltyReward(
  client: ApiClient,
  id: string,
  patch: Partial<UpsertLoyaltyRewardInput>,
): Promise<LoyaltyReward> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.pointsRequired !== undefined) body.points_required = patch.pointsRequired;
  if (patch.simpleDiscountId !== undefined) body.simple_discount_id = patch.simpleDiscountId;
  if (patch.isActive !== undefined) body.is_active = patch.isActive;
  const { data } = await client.patch<{ data: JsonApiResource<LoyaltyRewardAttrs> }>(
    `/loyalty-rewards/${id}`,
    body,
  );
  return toLoyaltyReward(data);
}

export async function deleteLoyaltyReward(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/loyalty-rewards/${id}`);
}

export interface LoyaltyLedgerEntryAttrs {
  customer_id: string;
  points: number;
  type: LoyaltyLedgerEntryType;
  sale_id: string | null;
  loyalty_reward_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export function toLoyaltyLedgerEntry(
  resource: JsonApiResource<LoyaltyLedgerEntryAttrs>,
): LoyaltyLedgerEntry {
  const a = resource.attributes;
  return {
    id: resource.id,
    companyId: "",
    customerId: a.customer_id,
    points: a.points,
    type: a.type,
    saleId: a.sale_id,
    loyaltyRewardId: a.loyalty_reward_id,
    note: a.note,
    createdBy: a.created_by,
    createdAt: a.created_at,
  };
}

export interface LoyaltyLedgerFilter {
  customerId?: string;
  type?: LoyaltyLedgerEntryType;
  page?: number;
  pageSize?: number;
}

export async function listLoyaltyLedger(
  client: ApiClient,
  filter: LoyaltyLedgerFilter = {},
): Promise<{ entries: LoyaltyLedgerEntry[]; total: number }> {
  const query: Record<string, string> = {};
  if (filter.customerId) query.customer_id = filter.customerId;
  if (filter.type) query.type = filter.type;
  if (filter.page) query.page = String(filter.page);
  if (filter.pageSize) query.per_page = String(filter.pageSize);
  const { data, meta } = await client.get<{
    data: JsonApiResource<LoyaltyLedgerEntryAttrs>[];
    meta?: { total?: number };
  }>("/loyalty-points-ledger", query);
  return { entries: data.map(toLoyaltyLedgerEntry), total: meta?.total ?? data.length };
}

export interface LoyaltyEarningRuleAttrs {
  condition_operator: LoyaltyEarningConditionOperator;
  threshold_amount: number;
  reward_type: LoyaltyEarningRewardType;
  reward_value: number;
  is_auto: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

function toLoyaltyEarningRule(resource: JsonApiResource<LoyaltyEarningRuleAttrs>): LoyaltyEarningRule {
  const a = resource.attributes;
  return {
    id: resource.id,
    companyId: "",
    conditionOperator: a.condition_operator,
    thresholdAmount: a.threshold_amount,
    rewardType: a.reward_type,
    rewardValue: a.reward_value,
    isAuto: a.is_auto,
    isActive: a.is_active,
    sortOrder: a.sort_order,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

export async function listLoyaltyEarningRules(client: ApiClient): Promise<LoyaltyEarningRule[]> {
  const { data } = await client.get<{ data: JsonApiResource<LoyaltyEarningRuleAttrs>[] }>(
    "/loyalty-earning-rules",
  );
  return data.map(toLoyaltyEarningRule);
}

export interface UpsertLoyaltyEarningRuleInput {
  conditionOperator: LoyaltyEarningConditionOperator;
  thresholdAmount: number;
  rewardType: LoyaltyEarningRewardType;
  rewardValue: number;
  isAuto?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export async function createLoyaltyEarningRule(
  client: ApiClient,
  input: UpsertLoyaltyEarningRuleInput,
): Promise<LoyaltyEarningRule> {
  const { data } = await client.post<{ data: JsonApiResource<LoyaltyEarningRuleAttrs> }>(
    "/loyalty-earning-rules",
    {
      condition_operator: input.conditionOperator,
      threshold_amount: input.thresholdAmount,
      reward_type: input.rewardType,
      reward_value: input.rewardValue,
      is_auto: input.isAuto ?? true,
      is_active: input.isActive ?? true,
      sort_order: input.sortOrder ?? 0,
    },
  );
  return toLoyaltyEarningRule(data);
}

export async function updateLoyaltyEarningRule(
  client: ApiClient,
  id: string,
  patch: Partial<UpsertLoyaltyEarningRuleInput>,
): Promise<LoyaltyEarningRule> {
  const body: Record<string, unknown> = {};
  if (patch.conditionOperator !== undefined) body.condition_operator = patch.conditionOperator;
  if (patch.thresholdAmount !== undefined) body.threshold_amount = patch.thresholdAmount;
  if (patch.rewardType !== undefined) body.reward_type = patch.rewardType;
  if (patch.rewardValue !== undefined) body.reward_value = patch.rewardValue;
  if (patch.isAuto !== undefined) body.is_auto = patch.isAuto;
  if (patch.isActive !== undefined) body.is_active = patch.isActive;
  if (patch.sortOrder !== undefined) body.sort_order = patch.sortOrder;
  const { data } = await client.patch<{ data: JsonApiResource<LoyaltyEarningRuleAttrs> }>(
    `/loyalty-earning-rules/${id}`,
    body,
  );
  return toLoyaltyEarningRule(data);
}

export async function deleteLoyaltyEarningRule(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/loyalty-earning-rules/${id}`);
}

/** For a sale whose matching rule is manual-only — see AwardLoyaltyPointsController. */
export async function awardLoyaltyPoints(client: ApiClient, saleId: string): Promise<{ points: number }> {
  const { data } = await client.post<{ data: { points: number } }>(`/sales/${saleId}/loyalty-points`);
  return data;
}
