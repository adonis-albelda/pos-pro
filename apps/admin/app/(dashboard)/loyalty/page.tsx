"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import {
  Award,
  BadgeCheck,
  Gift,
  History,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@double-a/shared-types";
import type { LoyaltyReward } from "@double-a/shared-types";
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
  StatCard,
  StatCardSkeleton,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { TabNav } from "@/components/tab-nav";
import { useDiscountRules } from "@/lib/query/discounts";
import { useCustomers } from "@/lib/query/customers";
import {
  useCreateLoyaltyReward,
  useDeleteLoyaltyReward,
  useLoyaltyLedger,
  useLoyaltyProgram,
  useLoyaltyRewards,
  useSaveLoyaltyProgram,
  useUpdateLoyaltyReward,
} from "@/lib/query/loyalty";

const TABS = [
  { key: "overview", label: "Overview", icon: Sparkles },
  { key: "rewards", label: "Rewards", icon: Gift },
  { key: "history", label: "Points History", icon: History },
  { key: "settings", label: "Settings", icon: SettingsIcon },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function parseTab(raw: string | null): TabKey {
  if (raw === "rewards" || raw === "history" || raw === "settings") return raw;
  return "overview";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function OverviewTab() {
  const programQuery = useLoyaltyProgram();
  const rewardsQuery = useLoyaltyRewards();
  const redemptionsQuery = useLoyaltyLedger({ type: "redemption", pageSize: 1 });

  const pending = programQuery.isPending || rewardsQuery.isPending || redemptionsQuery.isPending;

  if (pending) {
    return (
      <div className="grid gap-4 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  const activeRewards = (rewardsQuery.data ?? []).filter((r) => r.isActive).length;

  return (
    <div className="grid gap-4 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
      <StatCard
        icon={BadgeCheck}
        label="Program status"
        value={programQuery.data?.isActive ? "Active" : "Inactive"}
        hint={programQuery.data?.name ?? "Not yet named"}
        tone={programQuery.data?.isActive ? "success" : "neutral"}
      />
      <StatCard
        icon={Gift}
        label="Active rewards"
        value={String(activeRewards)}
        hint={`${(rewardsQuery.data ?? []).length} total`}
      />
      <StatCard
        icon={Award}
        label="Redemptions"
        value={String(redemptionsQuery.data?.total ?? 0)}
        hint="Lifetime, all customers"
        tone="primary"
      />
      <StatCard
        icon={Wallet}
        label="Points per ₱1"
        value={String(programQuery.data?.pointsPerCurrency ?? 1)}
        hint="Earn rate on completed sales"
      />
    </div>
  );
}

function RewardRow({ reward }: { reward: LoyaltyReward }) {
  const discountsQuery = useDiscountRules();
  const update = useUpdateLoyaltyReward();
  const remove = useDeleteLoyaltyReward();
  const discount = discountsQuery.data?.find((d) => d.id === reward.simpleDiscountId);
  const discountLabel = discount
    ? discount.type === "percentage"
      ? `${discount.value}% — ${discount.name}`
      : `${formatMoney(discount.value)} — ${discount.name}`
    : "Discount not found";

  return (
    <tr>
      <Td className="font-medium text-ink">{reward.name}</Td>
      <Td numeric className="num">{reward.pointsRequired.toLocaleString()}</Td>
      <Td>{discountLabel}</Td>
      <Td>
        <button
          type="button"
          onClick={() =>
            update.mutate(
              { id: reward.id, patch: { isActive: !reward.isActive } },
              { onError: (error) => toast.error(errorMessage(error, "Could not update reward.")) },
            )
          }
        >
          <Badge tone={reward.isActive ? "success" : "neutral"}>
            {reward.isActive ? "Active" : "Inactive"}
          </Badge>
        </button>
      </Td>
      <Td>
        <IconButton
          icon={Trash2}
          label="Delete reward"
          tone="danger"
          onClick={() => {
            if (!window.confirm(`Delete "${reward.name}"? This cannot be undone.`)) return;
            remove.mutate(reward.id, {
              onError: (error) => toast.error(errorMessage(error, "Could not delete reward.")),
            });
          }}
        />
      </Td>
    </tr>
  );
}

function CreateRewardForm({ onDone }: { onDone: () => void }) {
  const create = useCreateLoyaltyReward();
  const discountsQuery = useDiscountRules();
  const eligibleDiscounts = (discountsQuery.data ?? []).filter((d) => d.isActive);
  const [name, setName] = useState("");
  const [pointsRequired, setPointsRequired] = useState("1000");
  const [simpleDiscountId, setSimpleDiscountId] = useState("");

  return (
    <Card>
      <CardBody className="space-y-4">
        <p className="text-body font-medium text-ink">New loyalty reward</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Reward name" required>
            <Input value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="10% Off Reward" />
          </Field>
          <Field label="Points required" required>
            <Input
              type="number"
              min={1}
              step="1"
              value={pointsRequired}
              onChange={(e) => setPointsRequired(e.currentTarget.value)}
            />
          </Field>
          <Field label="Simple discount" required>
            <Select
              value={simpleDiscountId}
              onChange={(e) => setSimpleDiscountId(e.currentTarget.value)}
            >
              <option value="">Select a simple discount…</option>
              {eligibleDiscounts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.type === "percentage" ? `${d.value}%` : formatMoney(d.value)})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-caption text-ink-muted">
          Only compatible existing Simple Discounts are shown — the reward simply points at one; it
          never duplicates its type, value, or scopes.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={create.isPending}
            onClick={() => {
              const parsed = Number(pointsRequired);
              if (!name.trim() || !Number.isFinite(parsed) || parsed <= 0 || !simpleDiscountId) {
                toast.error("Name, a positive points value, and a discount are required.");
                return;
              }
              create.mutate(
                { name: name.trim(), pointsRequired: parsed, simpleDiscountId },
                {
                  onSuccess: () => {
                    toast.success("Reward created.");
                    onDone();
                  },
                  onError: (error) => toast.error(errorMessage(error, "Could not create reward.")),
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

function RewardsTab() {
  const rewardsQuery = useLoyaltyRewards();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setCreating(true)}>
          <Plus size={16} /> New reward
        </Button>
      </div>
      {creating ? <CreateRewardForm onDone={() => setCreating(false)} /> : null}
      {rewardsQuery.isPending ? (
        <CardListSkeleton count={3} />
      ) : rewardsQuery.isError ? (
        <p className="py-8 text-center text-body text-danger">Could not load rewards.</p>
      ) : (rewardsQuery.data ?? []).length === 0 ? (
        <p className="py-8 text-center text-body text-ink-muted">
          No loyalty rewards yet. Create one from an existing Simple Discount.
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Reward</Th>
              <Th numeric>Points required</Th>
              <Th>Discount</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Delete</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {(rewardsQuery.data ?? []).map((reward) => (
              <RewardRow key={reward.id} reward={reward} />
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function HistoryTab() {
  const searchParams = useSearchParams();
  const customersQuery = useCustomers();
  const [customerId, setCustomerId] = useState(searchParams.get("customer") ?? "");
  const ledgerQuery = useLoyaltyLedger({ customerId: customerId || undefined, pageSize: 50 });
  const customerNameById = useMemo(
    () => new Map((customersQuery.data ?? []).map((c) => [c.id, c.name])),
    [customersQuery.data],
  );

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <Field label="Customer">
        <Select value={customerId} onChange={(e) => setCustomerId(e.currentTarget.value)} className="sm:max-w-xs">
          <option value="">All customers</option>
          {(customersQuery.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.loyaltyPointsBalance.toLocaleString()} pts)
            </option>
          ))}
        </Select>
      </Field>

      {ledgerQuery.isPending ? (
        <CardListSkeleton count={4} />
      ) : ledgerQuery.isError ? (
        <p className="py-8 text-center text-body text-danger">Could not load points history.</p>
      ) : (ledgerQuery.data?.entries ?? []).length === 0 ? (
        <p className="py-8 text-center text-body text-ink-muted">No points activity yet.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Customer</Th>
              <Th>Type</Th>
              <Th numeric>Points</Th>
              <Th>Note</Th>
            </tr>
          </thead>
          <tbody>
            {(ledgerQuery.data?.entries ?? []).map((entry) => (
              <tr key={entry.id}>
                <Td className="whitespace-nowrap">
                  {new Date(entry.createdAt).toLocaleString("en-PH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </Td>
                <Td>{customerNameById.get(entry.customerId) ?? entry.customerId.slice(0, 8)}</Td>
                <Td className="capitalize">{entry.type}</Td>
                <Td numeric className={`num font-medium ${entry.points < 0 ? "text-danger" : "text-success"}`}>
                  {entry.points > 0 ? `+${entry.points}` : entry.points}
                </Td>
                <Td className="text-ink-muted">{entry.note ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function SettingsTab() {
  const programQuery = useLoyaltyProgram();
  const save = useSaveLoyaltyProgram();
  const [name, setName] = useState(programQuery.data?.name ?? "");
  const [isActive, setIsActive] = useState(programQuery.data?.isActive ?? true);
  const [pointsPerCurrency, setPointsPerCurrency] = useState(
    String(programQuery.data?.pointsPerCurrency ?? 1),
  );

  if (programQuery.isPending) {
    return (
      <div className="p-3 sm:p-4">
        <CardListSkeleton count={1} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Program name" required>
              <Input
                value={name || programQuery.data?.name || ""}
                onChange={(e) => setName(e.currentTarget.value)}
                placeholder="POSPro Rewards"
              />
            </Field>
            <Field label="Points earned per ₱1 spent" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={pointsPerCurrency}
                onChange={(e) => setPointsPerCurrency(e.currentTarget.value)}
              />
            </Field>
            <Field label="Status">
              <Select
                value={isActive ? "active" : "inactive"}
                onChange={(e) => setIsActive(e.currentTarget.value === "active")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>
          <p className="text-caption text-ink-muted">
            Reaching a reward&apos;s points threshold only makes it available to the cashier — it is
            never applied automatically. The cashier must select it in Apply Discount.
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={save.isPending}
              onClick={() => {
                const rate = Number(pointsPerCurrency);
                const finalName = (name || programQuery.data?.name || "").trim();
                if (!finalName || !Number.isFinite(rate) || rate < 0) {
                  toast.error("Name and a non-negative earn rate are required.");
                  return;
                }
                save.mutate(
                  { name: finalName, isActive, pointsPerCurrency: rate },
                  {
                    onSuccess: () => toast.success("Loyalty program saved."),
                    onError: (error) => toast.error(errorMessage(error, "Could not save program.")),
                  },
                );
              }}
            >
              Save
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default function LoyaltyPage() {
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const tabs = useMemo(
    () =>
      TABS.map((entry) => ({
        ...entry,
        href: (entry.key === "overview" ? "/loyalty" : `/loyalty?tab=${entry.key}`) as Route,
      })),
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Gift}
        title="Loyalty"
        description="Points, rewards, and redemptions. Loyalty decides when a customer is eligible — the linked Simple Discount still decides how the discount is applied."
      />

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <TabNav
          items={tabs}
          active={tab}
          ariaLabel="Loyalty sections"
          className="mx-0 bg-surface px-2 sm:px-3"
        />

        {tab === "overview" ? (
          <OverviewTab />
        ) : tab === "rewards" ? (
          <RewardsTab />
        ) : tab === "history" ? (
          <HistoryTab />
        ) : (
          <SettingsTab />
        )}
      </div>
    </div>
  );
}
