"use client";

import type { Route } from "next";
import Link from "next/link";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { matchesQuery, paginateItems, parseListQuery } from "@/lib/list-query";
import {
  Banknote,
  ChevronRight,
  CreditCard,
  Percent,
  Plus,
  Receipt,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react";
import { formatMoney } from "@double-a/shared-types";
import type { SaleWithItems, User } from "@double-a/shared-types";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Money,
  StatCard,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { DateRangePicker, type DayWindowValue } from "@/components/date-range-picker";
import { Pagination, SearchField } from "@/components/record-list";
import { useLocationMutationsLocked } from "@/components/location-mutations-banner";
import { SalesFiltersPopover } from "./sales-filters";

function SalesPanelHeader({
  users,
  devices,
  fromDay,
  toDay,
}: {
  users: User[];
  devices: string[];
  fromDay: string | null;
  toDay: string | null;
}) {
  const mutationsLocked = useLocationMutationsLocked();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { q } = parseListQuery({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });
  const listQuery = {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    userId: searchParams.get("userId") ?? undefined,
    deviceId: searchParams.get("deviceId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
  };

  function applyWindow(window: DayWindowValue) {
    const next = new URLSearchParams(searchParams.toString());
    if (window.fromDay) next.set("from", window.fromDay);
    else next.delete("from");
    if (window.toDay) next.set("to", window.toDay);
    else next.delete("to");
    next.delete("page");
    router.push(`/sales?${next.toString()}` as Route);
  }

  return (
    <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 shrink-0">
        <h1 className="text-heading-md font-semibold text-ink">Sales</h1>
        <p className="mt-1 max-w-xl text-body text-ink-muted">
          Every sale synced from a terminal. A sale made offline appears here only after its
          terminal syncs.
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
        <SearchField
          placeholder="Search cashier, customer, terminal…"
          defaultValue={q}
          preserve={listQuery}
          className="sm:max-w-xs"
        />
        <DateRangePicker
          fromDay={fromDay}
          toDay={toDay}
          onApply={applyWindow}
          className="sm:max-w-xs"
        />
        <SalesFiltersPopover users={users} devices={devices} className="sm:max-w-xs" />
        {mutationsLocked ? (
          <ButtonLink
            href="/sales"
            icon={Plus}
            size="sm"
            className="pointer-events-none opacity-40"
            aria-disabled
            title="Pick a specific location to create sales"
          >
            New sale
          </ButtonLink>
        ) : (
          <ButtonLink href="/sales/new" icon={Plus} size="sm">
            New sale
          </ButtonLink>
        )}
      </div>
    </div>
  );
}

/** Reads q/page from the URL — search and pagination stay here, not in the page shell. */
function SalesTableSection({
  sales,
  users,
  fetching = false,
}: {
  sales: SaleWithItems[];
  users: User[];
  fetching?: boolean;
}) {
  const searchParams = useSearchParams();
  const { q, page } = parseListQuery({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const userId = searchParams.get("userId") ?? undefined;
  const deviceId = searchParams.get("deviceId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const cashierNameById = useMemo(
    () => new Map(users.map((user) => [user.id, user.name])),
    [users],
  );

  const filtered = useMemo(
    () =>
      sales.filter((sale) =>
        matchesQuery(
          [
            sale.userId ? cashierNameById.get(sale.userId) : null,
            sale.customerName,
            sale.deviceId,
            sale.paymentMethod,
            sale.status,
            sale.id,
          ],
          q,
        ),
      ),
    [sales, cashierNameById, q],
  );

  const { pageItems, page: safePage, pageCount, total, pageSize } = useMemo(
    () => paginateItems(filtered, page),
    [filtered, page],
  );

  // Gross profit reads sale_items.unit_cost — the supplier price snapshotted
  // at sale time, never today's product cost (CLAUDE.md §6). Voided/refunded
  // sales are excluded, same as the Reports profit report.
  const stats = useMemo(() => {
    const completed = filtered.filter((sale) => sale.status === "completed");
    const revenue = completed.reduce((sum, sale) => sum + sale.totalAmount, 0);
    let cost = 0;
    let discount = 0;
    for (const sale of completed) {
      for (const item of sale.items) {
        cost += item.unitCost * item.quantity;
        discount += (item.listPrice - item.unitPrice) * item.quantity;
      }
    }
    const grossProfit = revenue - cost;
    const marginPercent = revenue === 0 ? 0 : (grossProfit / revenue) * 100;

    return { revenue, cost, discount, grossProfit, marginPercent, count: completed.length };
  }, [filtered]);

  const listQuery = {
    q: q || undefined,
    from,
    to,
    userId,
    deviceId,
    status,
  };

  return (
    <>
      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Gross revenue"
          value={formatMoney(stats.revenue)}
          hint={`${stats.count} completed sale${stats.count === 1 ? "" : "s"}`}
        />
        <StatCard icon={Receipt} label="Cost of goods" value={formatMoney(stats.cost)} tone="neutral" />
        <StatCard
          icon={TrendingUp}
          label="Gross profit"
          value={formatMoney(stats.grossProfit)}
          hint={`${stats.marginPercent.toFixed(1)}% margin`}
          tone={stats.grossProfit < 0 ? "danger" : "success"}
        />
        <StatCard
          icon={Percent}
          label="Discounts given"
          value={formatMoney(stats.discount)}
          tone={stats.discount > 0 ? "warning" : "neutral"}
        />
      </div>

      {q ? (
        <div className="border-b border-border px-4 py-3 text-caption text-ink-muted sm:px-6">
          {total} match{total === 1 ? "" : "es"}
        </div>
      ) : null}

      {total === 0 ? (
        <EmptyState
          icon={Receipt}
          title={q ? "Nothing matches that search" : "No sales in this range"}
          instruction={
            q
              ? "Try a different cashier, customer or terminal."
              : "Widen the dates, or check that the terminal has synced."
          }
        />
      ) : (
        <Table fetching={fetching}>
          <thead>
            <tr>
              <Th>Sold at</Th>
              <Th>Cashier</Th>
              <Th>Terminal</Th>
              <Th>Payment</Th>
              <Th numeric>Items</Th>
              <Th numeric>Total</Th>
              <Th>State</Th>
              <Th>
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((sale) => {
              const soldAt = new Date(sale.createdAt).toLocaleString("en-PH", {
                dateStyle: "medium",
                timeStyle: "short",
              });

              return (
                <tr key={sale.id} className="group relative cursor-pointer">
                  <Td className="whitespace-nowrap">
                    <Link
                      href={`/sales/${sale.id}` as Route}
                      className="absolute inset-0 z-10"
                      aria-label={`View sale from ${soldAt}`}
                    />
                    <span className="num font-medium text-primary group-hover:underline">
                      {soldAt}
                    </span>
                    <span className="num mt-0.5 block text-caption text-ink-muted">
                      {sale.invoiceNumber ?? sale.id.slice(0, 8)}
                    </span>
                    {sale.customerName ? (
                      <span className="mt-0.5 flex items-center gap-1.5 text-caption text-ink-muted">
                        <UserRound size={12} />
                        {sale.customerName}
                      </span>
                    ) : null}
                  </Td>
                  <Td>{(sale.userId && cashierNameById.get(sale.userId)) ?? "—"}</Td>
                  <Td className="num text-ink-muted">{sale.deviceId ?? "—"}</Td>
                  <Td>
                    {sale.paymentMethod ? (
                      <span className="inline-flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap capitalize">
                          {sale.paymentMethod === "cash" ? (
                            <Banknote size={15} className="text-ink-muted" />
                          ) : (
                            <CreditCard size={15} className="text-ink-muted" />
                          )}
                          {sale.paymentMethod}
                        </span>
                        <span className="flex flex-wrap gap-1">
                          {sale.isPaid ? (
                            <Badge tone="success">Paid</Badge>
                          ) : (
                            <Badge tone="warning">Unpaid</Badge>
                          )}
                          {sale.fulfillment === "delivery" ? (
                            <Badge tone={sale.deliveryCompleted ? "success" : "warning"}>
                              {sale.deliveryCompleted ? "Delivered" : "Delivery"}
                            </Badge>
                          ) : null}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td numeric>
                    {sale.items.reduce((count, item) => count + item.quantity, 0)}
                  </Td>
                  <Td numeric>
                    <Money value={sale.totalAmount} className="font-semibold" />
                  </Td>
                  <Td>
                    {sale.status === "completed" ? (
                      <Badge tone="success">Completed</Badge>
                    ) : sale.status === "voided" ? (
                      <Badge tone="danger">Voided</Badge>
                    ) : (
                      <Badge tone="warning">Refunded</Badge>
                    )}
                  </Td>
                  <Td>
                    <ChevronRight
                      size={16}
                      className="text-ink-muted transition-colors group-hover:text-primary"
                      aria-hidden
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Pagination
        page={safePage}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        basePath="/sales"
        query={listQuery}
      />
    </>
  );
}

export function SalesPanel({
  sales,
  users,
  fetching = false,
  fromDay,
  toDay,
}: {
  sales: SaleWithItems[];
  users: User[];
  fetching?: boolean;
  fromDay: string | null;
  toDay: string | null;
}) {
  const devices = useMemo(
    () => [...new Set(sales.map((sale) => sale.deviceId).filter(Boolean))] as string[],
    [sales],
  );

  return (
    <Card>
      <SalesPanelHeader users={users} devices={devices} fromDay={fromDay} toDay={toDay} />
      <SalesTableSection sales={sales} users={users} fetching={fetching} />
    </Card>
  );
}
