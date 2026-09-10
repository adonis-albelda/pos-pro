import type {
  ComplexDiscountCondition,
  ComplexDiscountRule,
  ComplexConditionLogic,
  ComplexConditionType,
  ComplexOperator,
  ComplexRewardType,
  DiscountAppliesTo,
  DiscountRule,
  DiscountRuleScope,
  DiscountRuleType,
  DiscountScopeType,
} from "@double-a/shared-types";
import type { ApiClient, JsonApiResource } from "../http";

export interface ScopeAttrs {
  id: string;
  scope_type: DiscountScopeType;
  scope_id: string;
}

export interface DiscountRuleAttrs {
  name: string;
  type: DiscountRuleType;
  value: number;
  applies_to: DiscountAppliesTo;
  requires_id_number: boolean;
  is_vat_exempt: boolean;
  is_system_protected: boolean;
  is_active: boolean;
  scopes: ScopeAttrs[];
  created_at?: string;
  updated_at?: string;
}

export interface ConditionAttrs {
  id: string;
  condition_type: ComplexConditionType;
  target_id: string | null;
  operator: ComplexOperator;
  threshold_value: number;
}

export interface ComplexDiscountRuleAttrs {
  name: string;
  reward_type: ComplexRewardType;
  reward_value: number | null;
  reward_free_variant_id: string | null;
  condition_logic: ComplexConditionLogic;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  conditions: ConditionAttrs[];
  created_at?: string;
  updated_at?: string;
}

function toScope(s: ScopeAttrs): DiscountRuleScope {
  return { id: s.id, scopeType: s.scope_type, scopeId: s.scope_id };
}

export function toDiscountRule(resource: JsonApiResource<DiscountRuleAttrs>): DiscountRule {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    type: a.type,
    value: a.value,
    appliesTo: a.applies_to,
    requiresIdNumber: a.requires_id_number,
    isVatExempt: a.is_vat_exempt,
    isSystemProtected: a.is_system_protected,
    isActive: a.is_active,
    scopes: (a.scopes ?? []).map(toScope),
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

function toCondition(c: ConditionAttrs): ComplexDiscountCondition {
  return {
    id: c.id,
    conditionType: c.condition_type,
    targetId: c.target_id,
    operator: c.operator,
    thresholdValue: c.threshold_value,
  };
}

export function toComplexDiscountRule(
  resource: JsonApiResource<ComplexDiscountRuleAttrs>,
): ComplexDiscountRule {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    rewardType: a.reward_type,
    rewardValue: a.reward_value,
    rewardFreeVariantId: a.reward_free_variant_id,
    conditionLogic: a.condition_logic,
    isActive: a.is_active,
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    conditions: (a.conditions ?? []).map(toCondition),
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

export async function listDiscountRules(client: ApiClient): Promise<DiscountRule[]> {
  const { data } = await client.get<{ data: JsonApiResource<DiscountRuleAttrs>[] }>("/discount-rules");
  return data.map(toDiscountRule);
}

export interface UpsertDiscountRuleInput {
  name: string;
  type: DiscountRuleType;
  value: number;
  appliesTo?: DiscountAppliesTo;
  requiresIdNumber?: boolean;
  isActive?: boolean;
  scopes?: { scopeType: DiscountScopeType; scopeId: string }[];
}

export async function createDiscountRule(
  client: ApiClient,
  input: UpsertDiscountRuleInput,
): Promise<DiscountRule> {
  const { data } = await client.post<{ data: JsonApiResource<DiscountRuleAttrs> }>("/discount-rules", {
    name: input.name,
    type: input.type,
    value: input.value,
    applies_to: input.appliesTo ?? "total",
    requires_id_number: input.requiresIdNumber ?? false,
    is_active: input.isActive ?? true,
    scopes: (input.scopes ?? []).map((s) => ({
      scope_type: s.scopeType,
      scope_id: s.scopeId,
    })),
  });
  return toDiscountRule(data);
}

export async function updateDiscountRule(
  client: ApiClient,
  id: string,
  patch: Partial<UpsertDiscountRuleInput> & { isActive?: boolean },
): Promise<DiscountRule> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.type !== undefined) body.type = patch.type;
  if (patch.value !== undefined) body.value = patch.value;
  if (patch.appliesTo !== undefined) body.applies_to = patch.appliesTo;
  if (patch.requiresIdNumber !== undefined) body.requires_id_number = patch.requiresIdNumber;
  if (patch.isActive !== undefined) body.is_active = patch.isActive;
  if (patch.scopes !== undefined) {
    body.scopes = patch.scopes.map((s) => ({
      scope_type: s.scopeType,
      scope_id: s.scopeId,
    }));
  }
  const { data } = await client.patch<{ data: JsonApiResource<DiscountRuleAttrs> }>(
    `/discount-rules/${id}`,
    body,
  );
  return toDiscountRule(data);
}

export async function deleteDiscountRule(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/discount-rules/${id}`);
}

export async function listComplexDiscountRules(client: ApiClient): Promise<ComplexDiscountRule[]> {
  const { data } = await client.get<{ data: JsonApiResource<ComplexDiscountRuleAttrs>[] }>(
    "/complex-discount-rules",
  );
  return data.map(toComplexDiscountRule);
}

export interface UpsertComplexDiscountRuleInput {
  name: string;
  rewardType: ComplexRewardType;
  rewardValue?: number | null;
  rewardFreeVariantId?: string | null;
  conditionLogic?: ComplexConditionLogic;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  conditions: {
    conditionType: ComplexConditionType;
    targetId?: string | null;
    operator?: ComplexOperator;
    thresholdValue: number;
  }[];
}

function toComplexBody(input: UpsertComplexDiscountRuleInput): Record<string, unknown> {
  return {
    name: input.name,
    reward_type: input.rewardType,
    reward_value: input.rewardValue ?? null,
    reward_free_variant_id: input.rewardFreeVariantId ?? null,
    condition_logic: input.conditionLogic ?? "all",
    is_active: input.isActive ?? true,
    starts_at: input.startsAt ?? null,
    ends_at: input.endsAt ?? null,
    conditions: input.conditions.map((c) => ({
      condition_type: c.conditionType,
      target_id: c.targetId ?? null,
      operator: c.operator ?? ">=",
      threshold_value: c.thresholdValue,
    })),
  };
}

export async function createComplexDiscountRule(
  client: ApiClient,
  input: UpsertComplexDiscountRuleInput,
): Promise<ComplexDiscountRule> {
  const { data } = await client.post<{ data: JsonApiResource<ComplexDiscountRuleAttrs> }>(
    "/complex-discount-rules",
    toComplexBody(input),
  );
  return toComplexDiscountRule(data);
}

export async function updateComplexDiscountRule(
  client: ApiClient,
  id: string,
  input: Partial<UpsertComplexDiscountRuleInput>,
): Promise<ComplexDiscountRule> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.rewardType !== undefined) body.reward_type = input.rewardType;
  if (input.rewardValue !== undefined) body.reward_value = input.rewardValue;
  if (input.rewardFreeVariantId !== undefined) body.reward_free_variant_id = input.rewardFreeVariantId;
  if (input.conditionLogic !== undefined) body.condition_logic = input.conditionLogic;
  if (input.isActive !== undefined) body.is_active = input.isActive;
  if (input.startsAt !== undefined) body.starts_at = input.startsAt;
  if (input.endsAt !== undefined) body.ends_at = input.endsAt;
  if (input.conditions !== undefined) {
    body.conditions = input.conditions.map((c) => ({
      condition_type: c.conditionType,
      target_id: c.targetId ?? null,
      operator: c.operator ?? ">=",
      threshold_value: c.thresholdValue,
    }));
  }
  const { data } = await client.patch<{ data: JsonApiResource<ComplexDiscountRuleAttrs> }>(
    `/complex-discount-rules/${id}`,
    body,
  );
  return toComplexDiscountRule(data);
}

export async function deleteComplexDiscountRule(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/complex-discount-rules/${id}`);
}
