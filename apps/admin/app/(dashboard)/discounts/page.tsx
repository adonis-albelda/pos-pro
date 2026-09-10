"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { BadgePercent, Lock, Plus, Percent, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@double-a/shared-types";
import type {
  ComplexConditionType,
  ComplexDiscountRule,
  ComplexOperator,
  ComplexRewardType,
  DiscountRule,
  DiscountRuleType,
} from "@double-a/shared-types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardListSkeleton,
  Field,
  IconButton,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import { TabNav } from "@/components/tab-nav";
import {
  useComplexDiscountRules,
  useCreateComplexDiscountRule,
  useCreateDiscountRule,
  useDeleteComplexDiscountRule,
  useDeleteDiscountRule,
  useDiscountRules,
  useUpdateComplexDiscountRule,
  useUpdateDiscountRule,
} from "@/lib/query/discounts";

const TABS = [
  { key: "simple", label: "Simple discounts", icon: Percent },
  { key: "complex", label: "Complex / promo", icon: BadgePercent },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function parseTab(raw: string | null): TabKey {
  return raw === "complex" ? "complex" : "simple";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function Toggle({
  enabled,
  disabled,
  onChange,
}: {
  enabled: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={[
        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
        "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        enabled ? "bg-primary" : "bg-border",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform",
          enabled ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

function ruleValueLabel(rule: DiscountRule): string {
  return rule.type === "percentage" ? `${rule.value}%` : formatMoney(rule.value);
}

function SimpleDiscountRow({ rule }: { rule: DiscountRule }) {
  const update = useUpdateDiscountRule();
  const remove = useDeleteDiscountRule();

  return (
    <Card>
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-body font-medium text-ink">{rule.name}</p>
            <Badge tone="neutral">{ruleValueLabel(rule)}</Badge>
            {rule.isSystemProtected ? (
              <Badge tone="warning">
                <span className="inline-flex items-center gap-1">
                  <Lock size={12} /> Government-mandated — locked
                </span>
              </Badge>
            ) : null}
            {rule.requiresIdNumber ? <Badge tone="neutral">ID required</Badge> : null}
            {rule.isVatExempt ? <Badge tone="success">VAT exempt</Badge> : null}
          </div>
          <p className="text-caption text-ink-muted">
            {rule.isSystemProtected
              ? "Type, value, and VAT exemption cannot change. Toggle active only."
              : `Applies to ${rule.appliesTo.replaceAll("_", " ")}.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Toggle
            enabled={rule.isActive}
            disabled={update.isPending}
            onChange={(next) =>
              update.mutate(
                { id: rule.id, patch: { isActive: next } },
                { onError: (error) => toast.error(errorMessage(error, "Could not update discount.")) },
              )
            }
          />
          {!rule.isSystemProtected ? (
            <IconButton
              icon={Trash2}
              label={`Delete ${rule.name}`}
              tone="danger"
              onClick={() => {
                if (!window.confirm(`Delete "${rule.name}"?`)) return;
                remove.mutate(rule.id, {
                  onError: (error) => toast.error(errorMessage(error, "Could not delete discount.")),
                });
              }}
            />
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

function CreateSimpleForm({ onDone }: { onDone: () => void }) {
  const create = useCreateDiscountRule();
  const [name, setName] = useState("");
  const [type, setType] = useState<DiscountRuleType>("percentage");
  const [value, setValue] = useState("10");

  return (
    <Card>
      <CardBody className="space-y-4">
        <p className="text-body font-medium text-ink">New simple discount</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Employee Discount" />
          </Field>
          <Field label="Type" required>
            <Select
              value={type}
              onChange={(e) => setType(e.currentTarget.value as DiscountRuleType)}
            >
              <option value="percentage">Percentage</option>
              <option value="fixed_amount">Fixed amount</option>
            </Select>
          </Field>
          <Field label="Value" required>
            <Input type="number" min={0} step="0.01" value={value} onChange={(e) => setValue(e.currentTarget.value)} />
          </Field>
        </div>
        <p className="text-caption text-ink-muted">
          Custom discounts are never VAT-exempt. Senior/PWD are seeded and locked.
        </p>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={create.isPending}
            onClick={() => {
              const parsed = Number(value);
              if (!name.trim() || !Number.isFinite(parsed) || parsed < 0) {
                toast.error("Name and a non-negative value are required.");
                return;
              }
              create.mutate(
                { name: name.trim(), type, value: parsed },
                {
                  onSuccess: () => {
                    toast.success("Discount created.");
                    onDone();
                  },
                  onError: (error) => toast.error(errorMessage(error, "Could not create discount.")),
                },
              );
            }}
          >
            <Plus size={16} /> Create
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function ComplexDiscountRow({ rule }: { rule: ComplexDiscountRule }) {
  const update = useUpdateComplexDiscountRule();
  const remove = useDeleteComplexDiscountRule();

  const rewardLabel =
    rule.rewardType === "free_item"
      ? "Free item"
      : rule.rewardType === "percentage"
        ? `${rule.rewardValue ?? 0}% off`
        : `${formatMoney(rule.rewardValue ?? 0)} off`;

  return (
    <Card>
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-body font-medium text-ink">{rule.name}</p>
            <Badge tone="neutral">{rewardLabel}</Badge>
            <Badge tone="neutral">Match {rule.conditionLogic === "all" ? "ALL" : "ANY"}</Badge>
          </div>
          <ul className="list-inside list-disc text-caption text-ink-muted">
            {rule.conditions.map((c) => (
              <li key={c.id}>
                {c.conditionType.replaceAll("_", " ")} {c.operator} {c.thresholdValue}
                {c.targetId ? ` (target ${c.targetId.slice(0, 8)}…)` : ""}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-3">
          <Toggle
            enabled={rule.isActive}
            disabled={update.isPending}
            onChange={(next) =>
              update.mutate(
                { id: rule.id, input: { isActive: next } },
                { onError: (error) => toast.error(errorMessage(error, "Could not update promo.")) },
              )
            }
          />
          <IconButton
            icon={Trash2}
            label={`Delete ${rule.name}`}
            tone="danger"
            onClick={() => {
              if (!window.confirm(`Delete "${rule.name}"?`)) return;
              remove.mutate(rule.id, {
                onError: (error) => toast.error(errorMessage(error, "Could not delete promo.")),
              });
            }}
          />
        </div>
      </CardBody>
    </Card>
  );
}

function CreateComplexForm({ onDone }: { onDone: () => void }) {
  const create = useCreateComplexDiscountRule();
  const [name, setName] = useState("");
  const [rewardType, setRewardType] = useState<ComplexRewardType>("percentage");
  const [rewardValue, setRewardValue] = useState("10");
  const [conditionLogic, setConditionLogic] = useState<"all" | "any">("all");
  const [conditionType, setConditionType] = useState<ComplexConditionType>("total_amount");
  const [operator, setOperator] = useState<ComplexOperator>(">=");
  const [threshold, setThreshold] = useState("1000");

  return (
    <Card>
      <CardBody className="space-y-4">
        <p className="text-body font-medium text-ink">New complex / promo discount</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Spend ₱1,000 get 10%" />
          </Field>
          <Field label="Condition logic" required>
            <Select
              value={conditionLogic}
              onChange={(e) => setConditionLogic(e.currentTarget.value as "all" | "any")}
            >
              <option value="all">Match ALL conditions</option>
              <option value="any">Match ANY condition</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Condition" required>
            <Select
              value={conditionType}
              onChange={(e) => setConditionType(e.currentTarget.value as ComplexConditionType)}
            >
              <option value="total_amount">Total amount</option>
              <option value="product_quantity">Product quantity</option>
              <option value="variant_quantity">Variant quantity</option>
              <option value="category_quantity">Category quantity</option>
            </Select>
          </Field>
          <Field label="Operator" required>
            <Select
              value={operator}
              onChange={(e) => setOperator(e.currentTarget.value as ComplexOperator)}
            >
              <option value=">=">&gt;=</option>
              <option value=">">&gt;</option>
              <option value="=">=</option>
              <option value="<=">&lt;=</option>
              <option value="<">&lt;</option>
            </Select>
          </Field>
          <Field label="Threshold" required>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(e.currentTarget.value)}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reward" required>
            <Select
              value={rewardType}
              onChange={(e) => setRewardType(e.currentTarget.value as ComplexRewardType)}
            >
              <option value="percentage">Percentage off cart</option>
              <option value="fixed_amount">Fixed amount off</option>
              <option value="free_item">Free item (set variant later)</option>
            </Select>
          </Field>
          {rewardType !== "free_item" ? (
            <Field label="Reward value" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={rewardValue}
                onChange={(e) => setRewardValue(e.currentTarget.value)}
              />
            </Field>
          ) : (
            <p className="self-end text-caption text-ink-muted">
              Free-item promos need a variant id — edit via API after create, or add picker in a follow-up.
            </p>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={create.isPending || rewardType === "free_item"}
            onClick={() => {
              const thr = Number(threshold);
              const reward = Number(rewardValue);
              if (!name.trim() || !Number.isFinite(thr)) {
                toast.error("Name and threshold required.");
                return;
              }
              if (rewardType !== "free_item" && !Number.isFinite(reward)) {
                toast.error("Reward value required.");
                return;
              }
              create.mutate(
                {
                  name: name.trim(),
                  rewardType,
                  rewardValue: rewardType === "free_item" ? null : reward,
                  conditionLogic,
                  conditions: [
                    {
                      conditionType,
                      operator,
                      thresholdValue: thr,
                      targetId: conditionType === "total_amount" ? null : null,
                    },
                  ],
                },
                {
                  onSuccess: () => {
                    toast.success("Promo created.");
                    onDone();
                  },
                  onError: (error) => toast.error(errorMessage(error, "Could not create promo.")),
                },
              );
            }}
          >
            <Plus size={16} /> Create
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export default function DiscountsPage() {
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const [creating, setCreating] = useState(false);

  const simpleQuery = useDiscountRules();
  const complexQuery = useComplexDiscountRules();

  const tabs = useMemo(
    () =>
      TABS.map((entry) => ({
        ...entry,
        href: (entry.key === "simple" ? "/discounts" : "/discounts?tab=complex") as Route,
      })),
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BadgePercent}
        title="Discounts"
        description="Simple cashier discounts (Senior/PWD locked) and condition-based promos. Stacking: Senior/PWD never stacks with a promo."
        action={
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus size={16} /> New {tab === "simple" ? "simple" : "promo"}
          </Button>
        }
      />

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <TabNav
          items={tabs}
          active={tab}
          ariaLabel="Discount types"
          className="mx-0 bg-surface px-2 sm:px-3"
        />

        {tab === "simple" ? (
          <div className="space-y-3 p-3 sm:p-4">
            {creating ? <CreateSimpleForm onDone={() => setCreating(false)} /> : null}
            {simpleQuery.isPending ? (
              <CardListSkeleton count={3} />
            ) : simpleQuery.isError ? (
              <p className="py-8 text-center text-body text-danger">Could not load discounts.</p>
            ) : (
              (simpleQuery.data ?? []).map((rule) => <SimpleDiscountRow key={rule.id} rule={rule} />)
            )}
          </div>
        ) : (
          <div className="space-y-3 p-3 sm:p-4">
            {creating ? <CreateComplexForm onDone={() => setCreating(false)} /> : null}
            {complexQuery.isPending ? (
              <CardListSkeleton count={3} />
            ) : complexQuery.isError ? (
              <p className="py-8 text-center text-body text-danger">Could not load promos.</p>
            ) : (complexQuery.data ?? []).length === 0 ? (
              <p className="py-8 text-center text-body text-ink-muted">No promo discounts yet.</p>
            ) : (
              (complexQuery.data ?? []).map((rule) => <ComplexDiscountRow key={rule.id} rule={rule} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
