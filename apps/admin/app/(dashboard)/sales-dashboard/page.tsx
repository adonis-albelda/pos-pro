"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Ban,
  BadgePercent,
  ChartColumn,
  ContactRound,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { formatMoney } from "@double-a/shared-types";
import { summariseProfit } from "@double-a/api-client/queries";
import { resolveRange, shiftDays, startOfStoreDay } from "@/lib/date-range";
import { DateRangePicker, type DayWindowValue } from "@/components/date-range-picker";
import type { Route } from "next";
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { AdminGate } from "@/components/admin-gate";
import {
  useReportByCategory,
  useReportByCashier,
  useReportByLocation,
  useReportByPaymentMethod,
  useReportProfit,
  useReportRefundsVoids,
  useReportTopProducts,
} from "@/lib/query/reports";
import { DashboardBarChart, DashboardColumnChart } from "../dashboard-bar-chart";
import { PrintSalesReportButton } from "./print-sales-report-button";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  ewallet: "E-wallet",
  card: "Card",
  credit: "Credit",
  other: "Other",
};

function changeVsPrevious(current: number, previous: number): { label: string; up: boolean } | null {
  if (previous === 0) return null;
  const percent = ((current - previous) / previous) * 100;
  return { label: `${Math.abs(percent).toFixed(1)}%`, up: percent >= 0 };
}

export default function SalesDashboardPage() {
  return (
    <AdminGate
      icon={ChartColumn}
      title="Sales Dashboard"
      forbiddenTitle="The sales dashboard is for the owner's account"
      instruction="Only an admin can view sales performance."
    >
      <SalesDashboardPageClient />
    </AdminGate>
  );
}

function SalesDashboardPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = {
    preset: searchParams.get("preset") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };
  const { fromDay, toDay, range, label } = resolveRange(params);

  // Same-length period immediately before the selected one — "today" compares
  // to yesterday, "this month" (≈30 days) compares to the ≈30 days before it.
  const spanDays =
    Math.round((new Date(toDay).getTime() - new Date(fromDay).getTime()) / 86_400_000) + 1;
  const previousToDay = shiftDays(fromDay, -1);
  const previousFromDay = shiftDays(previousToDay, -(spanDays - 1));
  const previousRange = {
    from: startOfStoreDay(previousFromDay),
    to: startOfStoreDay(shiftDays(previousToDay, 1)),
  };

  function applyWindow(window: DayWindowValue) {
    const next = new URLSearchParams(searchParams.toString());
    if (window.fromDay) next.set("from", window.fromDay);
    else next.delete("from");
    if (window.toDay) next.set("to", window.toDay);
    else next.delete("to");
    next.delete("preset");
    router.push(`/sales-dashboard?${next.toString()}` as Route);
  }

  const profitQuery = useReportProfit(range);
  const previousProfitQuery = useReportProfit(previousRange);
  const topProductsQuery = useReportTopProducts(range, 10);
  const categoryQuery = useReportByCategory(range);
  const paymentMethodQuery = useReportByPaymentMethod(range);
  const locationQuery = useReportByLocation(range);
  const cashierQuery = useReportByCashier(range);
  const refundsVoidsQuery = useReportRefundsVoids(range);

  const bootPending = profitQuery.isPending && !profitQuery.data;
  const summary = profitQuery.data ? summariseProfit(profitQuery.data) : null;
  const previousSummary = previousProfitQuery.data ? summariseProfit(previousProfitQuery.data) : null;
  const averageOrder = summary && summary.salesCount > 0 ? summary.revenue / summary.salesCount : 0;

  const revenueChange =
    summary && previousSummary ? changeVsPrevious(summary.revenue, previousSummary.revenue) : null;

  const locations = locationQuery.data ?? [];
  const showLocationCard = locations.length > 1;

  return (
    <div className="space-y-6">
      <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          icon={ChartColumn}
          title="Sales Dashboard"
          description="How much, what, when, where, and who — sales performance for the selected period."
        />
        <div className="flex items-center gap-2">
          <DateRangePicker fromDay={fromDay} toDay={toDay} onApply={applyWindow} className="sm:w-64" />
          <PrintSalesReportButton from={range.from} to={range.to} fromDay={fromDay} toDay={toDay} />
        </div>
      </div>
      <p className="text-caption text-ink-muted">{label}</p>

      {bootPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={TrendingUp}
            label="Total Sales"
            value={summary ? formatMoney(summary.revenue) : "—"}
            hint={
              revenueChange
                ? `${revenueChange.up ? "↑" : "↓"} ${revenueChange.label} vs previous period`
                : undefined
            }
            tone={revenueChange ? (revenueChange.up ? "success" : "danger") : "primary"}
          />
          <StatCard
            icon={Receipt}
            label="Transactions"
            value={summary ? String(summary.salesCount) : "—"}
          />
          <StatCard
            icon={Wallet}
            label="Average Order"
            value={summary ? formatMoney(averageOrder) : "—"}
          />
          <StatCard
            icon={ShoppingBag}
            label="Items Sold"
            value={summary ? String(summary.itemsSold) : "—"}
          />
        </div>
      )}

      <Card className="px-4 py-5 sm:px-6">
        <CardHeader icon={ChartColumn} title="Sales Trend" description="Revenue per day for the selected period." />
        {profitQuery.isPending ? (
          <Skeleton className="h-44 w-full" />
        ) : !profitQuery.data || profitQuery.data.length === 0 ? (
          <p className="text-body text-ink-muted">No completed sales in this period.</p>
        ) : (
          <DashboardColumnChart
            items={profitQuery.data.map((row) => ({
              label: row.bucket.slice(5),
              value: Number(row.revenue),
              display: formatMoney(Number(row.revenue)),
            }))}
          />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={ShoppingBag}
            title="Top Selling Products"
            description="By revenue, this period."
          />
          {topProductsQuery.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : !topProductsQuery.data || topProductsQuery.data.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="No sales yet" instruction="Top products appear once sales come in." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th numeric>Qty Sold</Th>
                  <Th numeric>Sales</Th>
                </tr>
              </thead>
              <tbody>
                {topProductsQuery.data.map((row) => (
                  <tr key={row.product_id ?? row.product_name}>
                    <Td>
                      <span className="font-medium text-ink">{row.product_name}</span>
                      {row.category ? (
                        <span className="ml-1.5 text-caption text-ink-muted">{row.category}</span>
                      ) : null}
                    </Td>
                    <Td numeric>{row.quantity_sold}</Td>
                    <Td numeric className="font-medium">
                      {formatMoney(row.revenue)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="px-4 py-5 sm:px-6">
          <CardHeader icon={ChartColumn} title="Sales by Category" />
          {categoryQuery.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : !categoryQuery.data || categoryQuery.data.length === 0 ? (
            <p className="text-body text-ink-muted">No completed sales in this period.</p>
          ) : (
            <DashboardBarChart
              items={categoryQuery.data.map((row) => ({
                label: row.category,
                value: row.revenue,
                display: formatMoney(row.revenue),
              }))}
            />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="px-4 py-5 sm:px-6">
          <CardHeader icon={Wallet} title="Payment Methods" />
          {paymentMethodQuery.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : !paymentMethodQuery.data || paymentMethodQuery.data.length === 0 ? (
            <p className="text-body text-ink-muted">No completed sales in this period.</p>
          ) : (
            <DashboardBarChart
              items={paymentMethodQuery.data.map((row) => ({
                label: PAYMENT_METHOD_LABELS[row.payment_method] ?? row.payment_method,
                value: row.revenue,
                display: formatMoney(row.revenue),
              }))}
            />
          )}
        </Card>

        {showLocationCard ? (
          <Card className="px-4 py-5 sm:px-6">
            <CardHeader icon={Store} title="Sales by Location" />
            {locationQuery.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <DashboardBarChart
                items={locations.map((row) => ({
                  label: row.location_name,
                  value: row.revenue,
                  display: formatMoney(row.revenue),
                }))}
              />
            )}
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader icon={ContactRound} title="Sales by Cashier" />
        {cashierQuery.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : !cashierQuery.data || cashierQuery.data.length === 0 ? (
          <EmptyState icon={ContactRound} title="No sales yet" instruction="Cashier performance appears once sales come in." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Cashier</Th>
                <Th numeric>Transactions</Th>
                <Th numeric>Sales</Th>
              </tr>
            </thead>
            <tbody>
              {cashierQuery.data.map((row) => (
                <tr key={row.user_id ?? row.cashier_name}>
                  <Td className="font-medium text-ink">{row.cashier_name}</Td>
                  <Td numeric>{row.sales_count}</Td>
                  <Td numeric className="font-medium">
                    {formatMoney(row.revenue)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={BadgePercent}
          label="Discounts Given"
          value={summary ? formatMoney(summary.discount) : "—"}
          tone="warning"
        />
        <StatCard
          icon={RotateCcw}
          label="Refunds"
          value={refundsVoidsQuery.data ? formatMoney(refundsVoidsQuery.data.refund_amount) : "—"}
          hint={
            refundsVoidsQuery.data ? `${refundsVoidsQuery.data.refund_count} transactions` : undefined
          }
          tone="danger"
        />
        <StatCard
          icon={Ban}
          label="Voids"
          value={refundsVoidsQuery.data ? String(refundsVoidsQuery.data.void_count) : "—"}
          tone="neutral"
        />
      </div>
    </div>
  );
}
