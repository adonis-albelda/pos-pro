"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
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
import { formatMoney, formatPercent, stockLevel } from "@double-a/shared-types";
import { summariseProfit } from "@double-a/api-client/queries";
import { resolveRange } from "@/lib/date-range";
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
import { useUsers } from "@/lib/query/users";
import { useLocationFilter } from "@/components/location-filter-provider";

export default function DashboardPage() {
  const { range, fromDay, toDay } = resolveRange({ preset: "today" });
  const { locationId } = useLocationFilter();

  // GAP: IndexSalesController has no date-range filter (see queries/sales.ts) —
  // the old single query for "today's sales" is now "the 200 most recent
  // sales of any status, filtered to today client-side" below. Fine unless
  // a single shop day exceeds 200 sales.
  const salesQuery = useRecentSales(200, locationId);
  const lowStockQuery = useBelowReorder();
  const oversoldQuery = useOversoldProducts();
  // GAP: SaleResource carries no cashier name (see queries/sales.ts) — joined
  // client-side against the user list below instead.
  const usersQuery = useUsers({ includeInactive: true });

  // Profit/expenses/purchasing are admin-only on the API. A manager signed in
  // as a cashier still gets the rest of the dashboard rather than an error —
  // each is treated as "—" on a query error, same as the original server
  // component's `.catch(() => null)`.
  const profitQuery = useReportProfit(range);
  const expensesQuery = useExpensesTotal({ fromDay, toDay });
  const openPurchaseOrdersQuery = useOpenPurchaseOrdersCount();
  const supplierBalanceQuery = useSupplierBalanceTotal();
  const upcomingPaymentsQuery = useUpcomingSupplierPayments(7);

  const isPending = salesQuery.isPending || lowStockQuery.isPending || oversoldQuery.isPending;
  const isError = salesQuery.isError || lowStockQuery.isError || oversoldQuery.isError;

  if (isPending || isError) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Sun}
          title="Today"
          description="Sales pushed by every terminal that has synced today."
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

  const profit = profitRows ? summariseProfit(profitRows) : null;
  const cashierNameById = new Map(users.map((user) => [user.id, user.name]));

  const todaysSales = recentSales.filter((sale) => sale.createdAt >= range.from);
  // GAP: listOversold/listBelowReorder now return plain Product rows (see
  // queries/products.ts) — the old view's precomputed `oversold_by` delta is
  // gone, so it's derived here from the (necessarily negative) stock figure
  // an oversold product already carries.
  const oversold = oversoldRows.map((product) => ({
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
  const lowStock = lowStockRows.slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Sun}
        title="Today"
        description="Sales pushed by every terminal that has synced today."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          icon={TrendingUp}
          label="Revenue"
          value={formatMoney(revenue)}
          tone="primary"
        />
        <StatCard
          icon={Wallet}
          label="Expenses"
          value={
            expensesTotal === null ? "—" : formatMoney(expensesTotal)
          }
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
          hint={
            net === null
              ? "Revenue minus expenses"
              : "Revenue minus today's expenses"
          }
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
        <StatCard icon={Receipt} label="Sales" value={String(completed.length)} />
        <StatCard icon={ShoppingBag} label="Items sold" value={String(itemsSold)} />
        <StatCard
          icon={TriangleAlert}
          label="Oversold products"
          value={String(oversold.length)}
          hint={oversold.length > 0 ? "Needs a stock correction" : "Nothing to correct"}
          tone={oversold.length > 0 ? "danger" : "neutral"}
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
      </div>

      {oversold.length > 0 ? (
        <Card className="border-danger/30">
          <CardHeader
            icon={AlertTriangle}
            title="Oversold after sync"
            description="Two terminals sold the same last unit while offline. Correct the count, then restock."
          />
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
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={PackageSearch}
            title="Needs restocking"
            description="At or below each product's own reorder point."
            action={
              <Link
                href="/reports"
                className="inline-flex items-center gap-1 text-body font-medium text-primary hover:underline"
              >
                Reorder list
                <ArrowRight size={14} />
              </Link>
            }
          />
          {lowStock.length === 0 ? (
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
                {lowStock.map((product) => {
                  const level = stockLevel(product.stockQuantity, product.reorderPoint);
                  return (
                    <tr key={product.id}>
                      <Td>{product.name}</Td>
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
          )}
        </Card>

        <Card>
          <CardHeader
            icon={Receipt}
            title="Latest sales"
            description="Most recent sales synced from a terminal."
            action={
              <Link
                href="/sales"
                className="inline-flex items-center gap-1 text-body font-medium text-primary hover:underline"
              >
                All sales
                <ArrowRight size={14} />
              </Link>
            }
          />
          {todaysSales.length === 0 ? (
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
                  <Th>Cashier</Th>
                  <Th numeric>Total</Th>
                </tr>
              </thead>
              <tbody>
                {todaysSales.slice(0, 8).map((sale) => (
                  <tr key={sale.id}>
                    <Td>
                      <Link
                        href={`/sales/${sale.id}` as Route}
                        className="num font-medium text-primary hover:underline"
                      >
                        {new Date(sale.createdAt).toLocaleTimeString("en-PH", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Link>
                    </Td>
                    <Td>{(sale.userId && cashierNameById.get(sale.userId)) ?? "—"}</Td>
                    <Td numeric>
                      <Money value={sale.totalAmount} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            icon={CalendarClock}
            title="Upcoming supplier payments"
            description="Unpaid installment terms due within a week."
            action={
              <Link
                href={"/purchase-orders" as Route}
                className="inline-flex items-center gap-1 text-body font-medium text-primary hover:underline"
              >
                Purchase orders
                <ArrowRight size={14} />
              </Link>
            }
          />
          {upcomingPayments === null ? (
            <EmptyState
              icon={CalendarClock}
              title="Sign in as the owner to see this"
              instruction="Purchasing is an owner-only part of the dashboard."
            />
          ) : upcomingPayments.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Nothing due this week"
              instruction="Unpaid installment terms due in the next 7 days will show up here."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Supplier</Th>
                  <Th>Due</Th>
                  <Th numeric>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {upcomingPayments.map((payment) => (
                  <tr key={payment.id}>
                    {/*
                      GAP: the upcoming-payments endpoint carries no link back to
                      its purchase order or supplier (see
                      queries/purchase-orders.ts) — was a clickable supplier name
                      before, now just the term number and its own note.
                    */}
                    <Td>
                      <span className="font-medium text-ink">
                        Term #{payment.termNumber}
                      </span>
                      {payment.note ? (
                        <span className="ml-1.5 text-caption text-ink-muted">
                          {payment.note}
                        </span>
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
          )}
        </Card>
      </div>
    </div>
  );
}
