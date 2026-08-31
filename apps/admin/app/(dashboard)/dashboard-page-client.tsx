"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  CalendarClock,
  ChartColumn,
  ChevronRight,
  ClipboardList,
  Coins,
  PackageSearch,
  Percent,
  Receipt,
  ShoppingBag,
  Sun,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import type { ExpenseBill, Product, Sale } from "@double-a/shared-types";
import { formatMoney, formatPercent, stockLevel } from "@double-a/shared-types";
import { summariseProfit } from "@double-a/api-client/queries";
import type { UpcomingSupplierPayment } from "@double-a/api-client/queries";
import { resolveRange, formatStoreDay } from "@/lib/date-range";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Money,
  PageHeader,
  StatCard,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { Sheet } from "@/components/overlay";
import { useRecentSales } from "@/lib/query/sales";
import { useBelowReorder } from "@/lib/query/products";
import { useOversoldProducts } from "@/lib/query/inventory";
import { useReportProfit } from "@/lib/query/reports";
import { useExpensesTotal } from "@/lib/query/expenses";
import {
  useOpenPurchaseOrdersCount,
  useSupplierBalanceTotal,
  useUpcomingSupplierPayments,
} from "@/lib/query/purchase-orders";
import { useUpcomingExpenseBills } from "@/lib/query/expense-bills";
import { useUsers } from "@/lib/query/users";
import { useLocationFilter } from "@/components/location-filter-provider";
import { DashboardBarChart, DashboardColumnChart } from "./dashboard-bar-chart";

const DETAIL_SHEET_CLASS = "max-w-4xl w-full";

type DashboardPanel =
  | "oversold"
  | "low-stock"
  | "sales"
  | "supplier-payments"
  | "bills"
  | null;

type OversoldProduct = Product & { oversoldBy: number };

export function DashboardPageClient() {
  const [panel, setPanel] = useState<DashboardPanel>(null);
  const { range, fromDay, toDay } = resolveRange({ preset: "today" });
  const { locationId } = useLocationFilter();

  const salesQuery = useRecentSales(200, locationId, { from: range.from, to: range.to });
  const lowStockQuery = useBelowReorder();
  const oversoldQuery = useOversoldProducts();
  const usersQuery = useUsers({ includeInactive: true });
  const profitQuery = useReportProfit(range);
  const expensesQuery = useExpensesTotal({ fromDay, toDay });
  const openPurchaseOrdersQuery = useOpenPurchaseOrdersCount();
  const supplierBalanceQuery = useSupplierBalanceTotal();
  const upcomingPaymentsQuery = useUpcomingSupplierPayments(7);
  const upcomingBillsQuery = useUpcomingExpenseBills(30);

  const isPending = salesQuery.isPending || lowStockQuery.isPending || oversoldQuery.isPending;
  const isError = salesQuery.isError || lowStockQuery.isError || oversoldQuery.isError;

  const derived = useMemo(() => {
    const recentSales = salesQuery.data ?? [];
    const lowStockRows = lowStockQuery.data ?? [];
    const oversoldRows = oversoldQuery.data ?? [];
    const users = usersQuery.isError ? [] : (usersQuery.data ?? []);
    const profitRows = profitQuery.isError ? null : (profitQuery.data ?? null);
    const expensesTotal = expensesQuery.isError ? null : (expensesQuery.data ?? null);
    const openPurchaseOrders = openPurchaseOrdersQuery.isError
      ? null
      : (openPurchaseOrdersQuery.data ?? null);
    const supplierBalanceTotal = supplierBalanceQuery.isError
      ? null
      : (supplierBalanceQuery.data ?? null);
    const upcomingPayments = upcomingPaymentsQuery.isError
      ? null
      : (upcomingPaymentsQuery.data ?? null);
    const upcomingBills = upcomingBillsQuery.isError
      ? null
      : (upcomingBillsQuery.data ?? null);

    const profit = profitRows ? summariseProfit(profitRows) : null;
    const cashierNameById = new Map(users.map((user) => [user.id, user.name]));
    // Already scoped to today server-side via useRecentSales' from/to.
    const todaysSales = recentSales;
    const oversold: OversoldProduct[] = oversoldRows.map((product) => ({
      ...product,
      oversoldBy: product.stockQuantity < 0 ? Math.abs(product.stockQuantity) : 0,
    }));
    const completed = todaysSales.filter((sale) => sale.status === "completed");
    const revenue = completed.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const itemsSold = completed.reduce(
      (sum, sale) => sum + sale.items.reduce((n, item) => n + item.quantity, 0),
      0,
    );
    const net = expensesTotal === null ? null : revenue - expensesTotal;

    const salesByHour = Array.from({ length: 24 }, (_, hour) => {
      const count = completed.filter((sale) => new Date(sale.createdAt).getHours() === hour).length;
      return {
        label: new Date(2000, 0, 1, hour).toLocaleTimeString("en-PH", {
          hour: "numeric",
        }),
        value: count,
      };
    }).filter((bucket) => bucket.value > 0);

    const moneyBars = [
      { label: "Revenue", value: revenue, display: formatMoney(revenue), barClassName: "bg-primary" },
      ...(expensesTotal !== null
        ? [
            {
              label: "Expenses",
              value: expensesTotal,
              display: formatMoney(expensesTotal),
              barClassName: "bg-warning",
            },
          ]
        : []),
      ...(net !== null
        ? [
            {
              label: "Net",
              value: Math.abs(net),
              display: formatMoney(net),
              barClassName: net < 0 ? "bg-danger" : "bg-success",
            },
          ]
        : []),
      ...(profit
        ? [
            {
              label: "Gross profit",
              value: Math.abs(profit.grossProfit),
              display: formatMoney(profit.grossProfit),
              barClassName: profit.grossProfit < 0 ? "bg-danger" : "bg-success",
            },
          ]
        : []),
    ];

    return {
      todaysSales,
      lowStockRows,
      oversold,
      completed,
      revenue,
      itemsSold,
      net,
      profit,
      expensesTotal,
      openPurchaseOrders,
      supplierBalanceTotal,
      upcomingPayments,
      upcomingBills,
      cashierNameById,
      salesByHour,
      moneyBars,
    };
  }, [
    salesQuery.data,
    lowStockQuery.data,
    oversoldQuery.data,
    usersQuery.data,
    usersQuery.isError,
    profitQuery.data,
    profitQuery.isError,
    expensesQuery.data,
    expensesQuery.isError,
    openPurchaseOrdersQuery.data,
    openPurchaseOrdersQuery.isError,
    supplierBalanceQuery.data,
    supplierBalanceQuery.isError,
    upcomingPaymentsQuery.data,
    upcomingPaymentsQuery.isError,
    upcomingBillsQuery.data,
    upcomingBillsQuery.isError,
  ]);

  if (isPending || isError) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Sun}
          title="Dashboard"
          description="Today's pulse — revenue, stock health, and what needs attention."
        />
        <Card
          className={`px-4 py-8 text-center text-body ${isError ? "text-danger" : "text-ink-muted"}`}
        >
          {isPending
            ? "Loading…"
            : salesQuery.error instanceof Error
              ? salesQuery.error.message
              : lowStockQuery.error instanceof Error
                ? lowStockQuery.error.message
                : oversoldQuery.error instanceof Error
                  ? oversoldQuery.error.message
                  : "Could not load the dashboard."}
        </Card>
      </div>
    );
  }

  const {
    todaysSales,
    lowStockRows,
    oversold,
    completed,
    revenue,
    itemsSold,
    net,
    profit,
    expensesTotal,
    openPurchaseOrders,
    supplierBalanceTotal,
    upcomingPayments,
    upcomingBills,
    cashierNameById,
    salesByHour,
    moneyBars,
  } = derived;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Sun}
        title="Dashboard"
        description="Today's pulse — tap a stat or alert to open the full list."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="px-4 py-5 sm:px-6">
          <CardHeader
            icon={ChartColumn}
            title="Sales by hour"
            description="Completed sales synced today, bucketed by time."
          />
          {salesByHour.length === 0 ? (
            <p className="text-body text-ink-muted">No completed sales yet today.</p>
          ) : (
            <DashboardColumnChart items={salesByHour} />
          )}
        </Card>

        <Card className="px-4 py-5 sm:px-6">
          <CardHeader
            icon={TrendingUp}
            title="Money today"
            description="Revenue against costs and what is left."
          />
          <DashboardBarChart items={moneyBars} />
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          icon={TrendingUp}
          label="Revenue"
          value={formatMoney(revenue)}
          tone="primary"
          onClick={() => setPanel("sales")}
        />
        <StatCard
          icon={Wallet}
          label="Expenses"
          value={expensesTotal === null ? "—" : formatMoney(expensesTotal)}
          hint={
            expensesTotal === null
              ? "Sign in as the owner to see expenses"
              : expensesTotal > 0
                ? "Logged for today"
                : "Nothing logged today"
          }
          tone={expensesTotal && expensesTotal > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={TrendingDown}
          label="Net"
          value={net === null ? "—" : formatMoney(net)}
          hint={net === null ? "Revenue minus expenses" : "Revenue minus today's expenses"}
          tone={net !== null && net < 0 ? "danger" : "success"}
        />
        <StatCard
          icon={Coins}
          label="Gross profit"
          value={profit ? formatMoney(profit.grossProfit) : "—"}
          hint={
            profit
              ? `${formatMoney(profit.cost)} of that went to suppliers`
              : "Sign in as the owner to see profit"
          }
          tone={profit && profit.grossProfit < 0 ? "danger" : "success"}
        />
        <StatCard
          icon={Percent}
          label="Margin"
          value={profit ? formatPercent(profit.marginPercent) : "—"}
          hint={profit ? "Share of today's revenue kept" : undefined}
        />
        <StatCard
          icon={Receipt}
          label="Sales"
          value={String(completed.length)}
          hint="Tap to view today's sales"
          onClick={() => setPanel("sales")}
        />
        <StatCard
          icon={ShoppingBag}
          label="Items sold"
          value={String(itemsSold)}
          hint="Tap to view today's sales"
          onClick={() => setPanel("sales")}
        />
        <StatCard
          icon={TriangleAlert}
          label="Oversold products"
          value={String(oversold.length)}
          hint={oversold.length > 0 ? "Tap to review and correct" : "Nothing to correct"}
          tone={oversold.length > 0 ? "danger" : "neutral"}
          onClick={() => setPanel("oversold")}
        />
        <StatCard
          icon={PackageSearch}
          label="Needs restocking"
          value={String(lowStockRows.length)}
          hint={lowStockRows.length > 0 ? "At or below reorder point" : "Stock looks healthy"}
          tone={lowStockRows.length > 0 ? "warning" : "success"}
          onClick={() => setPanel("low-stock")}
        />
        <StatCard
          icon={ClipboardList}
          label="Open purchase orders"
          value={openPurchaseOrders === null ? "—" : String(openPurchaseOrders)}
          hint={
            openPurchaseOrders === null
              ? "Sign in as the owner to see purchasing"
              : "Ordered or partially received"
          }
          tone={openPurchaseOrders && openPurchaseOrders > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={Wallet}
          label="Supplier balance"
          value={supplierBalanceTotal === null ? "—" : formatMoney(supplierBalanceTotal)}
          hint={
            supplierBalanceTotal === null
              ? "Sign in as the owner to see purchasing"
              : "Unpaid across open purchase orders"
          }
          tone={supplierBalanceTotal && supplierBalanceTotal > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={CalendarClock}
          label="Supplier payments due"
          value={upcomingPayments === null ? "—" : String(upcomingPayments.length)}
          hint={
            upcomingPayments === null
              ? "Sign in as the owner"
              : "Unpaid terms due within 7 days"
          }
          tone={upcomingPayments && upcomingPayments.length > 0 ? "warning" : "neutral"}
          onClick={
            upcomingPayments && upcomingPayments.length > 0
              ? () => setPanel("supplier-payments")
              : undefined
          }
        />
        <StatCard
          icon={Wallet}
          label="Bills due soon"
          value={upcomingBills === null ? "—" : String(upcomingBills.length)}
          hint={
            upcomingBills === null ? "Sign in as the owner" : "Active bills due within 30 days"
          }
          tone={upcomingBills && upcomingBills.length > 0 ? "warning" : "neutral"}
          onClick={
            upcomingBills && upcomingBills.length > 0 ? () => setPanel("bills") : undefined
          }
        />
      </div>

      <DashboardDetailSheet
        panel={panel}
        onClose={() => setPanel(null)}
        oversold={oversold}
        lowStockRows={lowStockRows}
        todaysSales={todaysSales}
        cashierNameById={cashierNameById}
        upcomingPayments={upcomingPayments}
        upcomingBills={upcomingBills}
      />
    </div>
  );
}

function DashboardDetailSheet({
  panel,
  onClose,
  oversold,
  lowStockRows,
  todaysSales,
  cashierNameById,
  upcomingPayments,
  upcomingBills,
}: {
  panel: DashboardPanel;
  onClose: () => void;
  oversold: OversoldProduct[];
  lowStockRows: Product[];
  todaysSales: Sale[];
  cashierNameById: Map<string, string>;
  upcomingPayments: UpcomingSupplierPayment[] | null;
  upcomingBills: ExpenseBill[] | null;
}) {
  if (!panel) return null;

  const titles: Record<Exclude<DashboardPanel, null>, { title: string; description: string }> = {
    oversold: {
      title: "Oversold after sync",
      description:
        "Two terminals sold the same last unit while offline. Correct the count, then restock.",
    },
    "low-stock": {
      title: "Needs restocking",
      description: "Products at or below their own reorder point.",
    },
    sales: {
      title: "Today's sales",
      description: "Sales synced from terminals today.",
    },
    "supplier-payments": {
      title: "Upcoming supplier payments",
      description: "Unpaid installment terms due within a week.",
    },
    bills: {
      title: "Upcoming bills",
      description: "Active expense bills due within 30 days.",
    },
  };

  const copy = titles[panel];

  return (
    <Sheet
      open
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      className={DETAIL_SHEET_CLASS}
    >
      {panel === "oversold" ? (
        oversold.length === 0 ? (
          <EmptyState
            icon={TriangleAlert}
            title="Nothing oversold"
            instruction="Stock counts match after the last sync."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th numeric>Stock</Th>
                <Th numeric>Oversold by</Th>
              </tr>
            </thead>
            <tbody>
              {oversold.map((product) => (
                <tr key={product.id}>
                  <Td>
                    <Link
                      href={`/inventory?product=${product.id}` as Route}
                      className="group inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      {product.name}
                      <ChevronRight
                        size={14}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </Link>
                  </Td>
                  <Td className="text-ink-muted">{product.sku ?? "—"}</Td>
                  <Td numeric>{product.stockQuantity}</Td>
                  <Td numeric className="font-semibold text-danger">
                    {product.oversoldBy}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      ) : null}

      {panel === "low-stock" ? (
        lowStockRows.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="Every product has healthy stock"
            instruction="A product drops into this list once it falls to its own reorder point."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th numeric>Stock</Th>
                <Th numeric>Reorder at</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody>
              {lowStockRows.map((product) => {
                const level = stockLevel(product.stockQuantity, product.reorderPoint);
                return (
                  <tr key={product.id}>
                    <Td>
                      <Link
                        href={`/inventory?product=${product.id}` as Route}
                        className="font-medium text-primary hover:underline"
                      >
                        {product.name}
                      </Link>
                    </Td>
                    <Td numeric>{product.stockQuantity}</Td>
                    <Td numeric className="text-ink-muted">
                      {product.reorderPoint}
                    </Td>
                    <Td>
                      <Badge tone={level === "out" ? "danger" : "warning"}>
                        {level === "out" ? "Out of stock" : "Low stock"}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )
      ) : null}

      {panel === "sales" ? (
        todaysSales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No sales synced today"
            instruction="Sales appear here after a cashier taps Sync on a terminal."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Invoice</Th>
                <Th>Cashier</Th>
                <Th>Status</Th>
                <Th numeric>Total</Th>
              </tr>
            </thead>
            <tbody>
              {todaysSales.map((sale) => (
                <tr key={sale.id}>
                  <Td className="num text-ink-muted">
                    {new Date(sale.createdAt).toLocaleTimeString("en-PH", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Td>
                  <Td>
                    <Link
                      href={`/sales/${sale.id}` as Route}
                      className="num font-medium text-primary hover:underline"
                    >
                      {sale.invoiceNumber ?? sale.id.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>{(sale.userId && cashierNameById.get(sale.userId)) ?? "—"}</Td>
                  <Td className="capitalize">{sale.status}</Td>
                  <Td numeric>
                    <Money value={sale.totalAmount} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      ) : null}

      {panel === "supplier-payments" ? (
        !upcomingPayments || upcomingPayments.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Nothing due this week"
            instruction="Unpaid installment terms due in the next 7 days will show up here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Term</Th>
                <Th>Due</Th>
                <Th numeric>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {upcomingPayments.map((payment) => (
                <tr key={payment.id}>
                  <Td>
                    <span className="font-medium text-ink">Term #{payment.termNumber}</span>
                    {payment.note ? (
                      <span className="ml-1.5 text-caption text-ink-muted">{payment.note}</span>
                    ) : null}
                  </Td>
                  <Td className="num text-ink-muted">{payment.dueDate ?? "—"}</Td>
                  <Td numeric>
                    <Money value={payment.amount} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      ) : null}

      {panel === "bills" ? (
        !upcomingBills || upcomingBills.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nothing due soon"
            instruction="Active bills due in the next 30 days will show up here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Bill</Th>
                <Th>Due</Th>
                <Th numeric>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {upcomingBills.map((bill) => (
                <tr key={bill.id}>
                  <Td>
                    <span className="font-medium text-ink">{bill.description}</span>
                    {bill.remindersEnabled ? (
                      <span className="ml-1.5 text-caption text-ink-muted">
                        remind {bill.remindDaysBefore}d
                      </span>
                    ) : null}
                  </Td>
                  <Td className="num text-ink-muted">{formatStoreDay(bill.nextDueDate)}</Td>
                  <Td numeric>
                    <Money value={bill.amount} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      ) : null}
    </Sheet>
  );
}
