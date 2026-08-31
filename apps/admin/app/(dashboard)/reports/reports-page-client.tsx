"use client";

import { useSearchParams } from "next/navigation";
import {
  Banknote,
  CalendarRange,
  ChartColumn,
  Coins,
  Download,
  HandCoins,
  Package,
  PackageSearch,
  Percent,
  Receipt,
  Smartphone,
  Snowflake,
  SlidersHorizontal,
  Trophy,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Truck,
  UserRound,
  Wallet,
  Warehouse,
} from "lucide-react";
import { formatMoney, formatPercent } from "@double-a/shared-types";
import { summariseProfit } from "@double-a/api-client/queries";
import { formatStoreDay, resolveRange } from "@/lib/date-range";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Money,
  PageHeader,
  Skeleton,
  StatCard,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { useBelowReorder } from "@/lib/query/products";
import { useExpensesTotal } from "@/lib/query/expenses";
import {
  useReportByCashier,
  useReportByDevice,
  useReportDeadStock,
  useReportDiscounts,
  useReportInventoryValuationSummary,
  useReportProfit,
  useReportTopProducts,
} from "@/lib/query/reports";
import { DashboardBarChart } from "../dashboard-bar-chart";
import { DeadStockDays } from "./dead-stock-days";
import { DEAD_STOCK_DEFAULT_DAYS, DEAD_STOCK_WINDOWS } from "./dead-stock-windows";
import { ReportFilters } from "./report-filters";

/** Mirrors the loaded layout's shape (stat row, paired table cards, chart card) so nothing jumps once data lands. */
function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <Card key={index} className="p-4">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="mt-3 h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-28" />
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index}>
            <div className="border-b border-border px-4 py-4 sm:px-6">
              <Skeleton className="h-5 w-40" />
            </div>
            <div className="space-y-3 px-4 py-5 sm:px-6">
              {Array.from({ length: 5 }).map((_, row) => (
                <Skeleton key={row} className="h-5 w-full" />
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index}>
            <div className="border-b border-border px-4 py-4 sm:px-6">
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="space-y-3 px-4 py-5 sm:px-6">
              {Array.from({ length: 4 }).map((_, row) => (
                <Skeleton key={row} className="h-5 w-full" />
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <Skeleton className="h-5 w-44" />
          </div>
          <div className="space-y-3 px-4 py-5 sm:px-6">
            {Array.from({ length: 6 }).map((_, row) => (
              <Skeleton key={row} className="h-6 w-full" />
            ))}
          </div>
        </Card>
        <Card>
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="space-y-3 px-4 py-5 sm:px-6">
            {Array.from({ length: 4 }).map((_, row) => (
              <Skeleton key={row} className="h-5 w-full" />
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="space-y-3 px-4 py-5 sm:px-6">
          {Array.from({ length: 5 }).map((_, row) => (
            <Skeleton key={row} className="h-5 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function ReportsPageClient() {
  const searchParams = useSearchParams();
  const params = {
    preset: searchParams.get("preset") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };
  const { preset, fromDay, toDay, range, label } = resolveRange(params);
  const deadStockDays = DEAD_STOCK_WINDOWS.includes(Number(searchParams.get("days")))
    ? Number(searchParams.get("days"))
    : DEAD_STOCK_DEFAULT_DAYS;

  const profitQuery = useReportProfit(range);
  const topProductsQuery = useReportTopProducts(range, 20);
  const discountsQuery = useReportDiscounts(range);
  const cashiersQuery = useReportByCashier(range);
  const devicesQuery = useReportByDevice(range);
  const valuationQuery = useReportInventoryValuationSummary();
  const deadStockQuery = useReportDeadStock(deadStockDays);
  const reorderQuery = useBelowReorder();
  const expensesQuery = useExpensesTotal({ fromDay, toDay });

  const isPending =
    profitQuery.isPending ||
    topProductsQuery.isPending ||
    discountsQuery.isPending ||
    cashiersQuery.isPending ||
    devicesQuery.isPending ||
    valuationQuery.isPending ||
    deadStockQuery.isPending ||
    reorderQuery.isPending ||
    expensesQuery.isPending;

  const error =
    profitQuery.error ??
    topProductsQuery.error ??
    discountsQuery.error ??
    cashiersQuery.error ??
    devicesQuery.error ??
    valuationQuery.error ??
    deadStockQuery.error ??
    reorderQuery.error ??
    expensesQuery.error;

  const rangeQuery = `from=${fromDay}&to=${toDay}`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ChartColumn}
        title="Reports"
        description="What the shop made, who sold it, and what is sitting on the shelves."
        action={
          <ButtonLink href={`/api/export/sales?${rangeQuery}`} icon={Download} download>
            Export sales
          </ButtonLink>
        }
      />

      <Card>
        <CardHeader icon={SlidersHorizontal} title="Range" description={label} />
        <div className="px-4 py-5 sm:px-6">
          <ReportFilters preset={preset} fromDay={fromDay} toDay={toDay} />
        </div>
      </Card>

      {isPending ? (
        <ReportsSkeleton />
      ) : error ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {error instanceof Error ? error.message : "Could not load reports."}
        </Card>
      ) : (
        <ReportsBody
          profitRows={profitQuery.data ?? []}
          topProducts={topProductsQuery.data ?? []}
          discounts={discountsQuery.data ?? []}
          cashiers={cashiersQuery.data ?? []}
          devices={devicesQuery.data ?? []}
          valuation={valuationQuery.data ?? []}
          deadStock={deadStockQuery.data ?? []}
          reorder={reorderQuery.data ?? []}
          expensesTotal={expensesQuery.data ?? 0}
          deadStockDays={deadStockDays}
          label={label}
          rangeQuery={rangeQuery}
        />
      )}
    </div>
  );
}

function ReportsBody({
  profitRows,
  topProducts,
  discounts,
  cashiers,
  devices,
  valuation,
  deadStock,
  reorder,
  expensesTotal,
  deadStockDays,
  label,
  rangeQuery,
}: {
  profitRows: NonNullable<ReturnType<typeof useReportProfit>["data"]>;
  topProducts: NonNullable<ReturnType<typeof useReportTopProducts>["data"]>;
  discounts: NonNullable<ReturnType<typeof useReportDiscounts>["data"]>;
  cashiers: NonNullable<ReturnType<typeof useReportByCashier>["data"]>;
  devices: NonNullable<ReturnType<typeof useReportByDevice>["data"]>;
  valuation: NonNullable<ReturnType<typeof useReportInventoryValuationSummary>["data"]>;
  deadStock: NonNullable<ReturnType<typeof useReportDeadStock>["data"]>;
  reorder: NonNullable<ReturnType<typeof useBelowReorder>["data"]>;
  expensesTotal: number;
  deadStockDays: number;
  label: string;
  rangeQuery: string;
}) {
  const totals = summariseProfit(profitRows);
  const net = totals.revenue - expensesTotal;

  const stockCost = valuation.reduce((sum, row) => sum + row.costValue, 0);
  const stockRetail = valuation.reduce((sum, row) => sum + row.retailValue, 0);
  const stockProductCount = valuation.reduce((sum, row) => sum + row.productCount, 0);
  // GAP: listBelowReorder now returns plain Product rows (see
  // queries/products.ts) — the old view's precomputed `short_by`/`restock_cost`
  // columns are gone, derived here from stockQuantity/reorderPoint/costPrice.
  const reorderRows = reorder.map((row) => {
    const shortBy = Math.max(row.reorderPoint - row.stockQuantity, 0);
    return { ...row, shortBy, restockCost: shortBy * row.costPrice };
  });
  const restockCost = reorderRows.reduce((sum, row) => sum + row.restockCost, 0);

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Profit                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Revenue"
          value={formatMoney(totals.revenue)}
          hint={`${totals.salesCount} sales, ${totals.itemsSold} items`}
          tone="primary"
        />
        <StatCard
          icon={Truck}
          label="Supplier cost"
          value={formatMoney(totals.cost)}
          hint="What the goods cost you"
        />
        <StatCard
          icon={Coins}
          label="Gross profit"
          value={formatMoney(totals.grossProfit)}
          hint="Revenue minus supplier cost"
          tone={totals.grossProfit < 0 ? "danger" : "success"}
        />
        <StatCard
          icon={Percent}
          label="Margin"
          value={formatPercent(totals.marginPercent)}
          hint="Share of revenue kept"
        />
        <StatCard
          icon={HandCoins}
          label="Discounts given"
          value={formatMoney(totals.discount)}
          hint="Knocked off at the counter"
          tone={totals.discount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={Wallet}
          label="Expenses"
          value={formatMoney(expensesTotal)}
          hint="Operating outlays in this range"
          tone={expensesTotal > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={TrendingDown}
          label="Net"
          value={formatMoney(net)}
          hint="Revenue minus expenses, separate from gross profit"
          tone={net < 0 ? "danger" : "success"}
        />
      </div>
      <p className="text-caption text-ink-muted">
        Net and Gross profit are independent figures, not one derived from the other: Gross
        profit is revenue minus supplier cost, Net is revenue minus operating expenses.
      </p>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={CalendarRange}
            title="Day by day"
            description={`Completed sales, ${label}.`}
          />
          {profitRows.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No sales in this range"
              instruction="Widen the dates, or check that the terminals have synced today's sales."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Day</Th>
                  <Th numeric>Sales</Th>
                  <Th numeric>Revenue</Th>
                  <Th numeric>Gross profit</Th>
                  <Th numeric>Margin</Th>
                </tr>
              </thead>
              <tbody>
                {profitRows.map((row) => (
                  <tr key={row.bucket}>
                    <Td className="whitespace-nowrap font-medium">
                      {formatStoreDay(row.bucket)}
                    </Td>
                    <Td numeric>{Number(row.sales_count)}</Td>
                    <Td numeric>
                      <Money value={Number(row.revenue)} />
                    </Td>
                    <Td
                      numeric
                      className={
                        Number(row.gross_profit) < 0
                          ? "font-semibold text-danger"
                          : "font-semibold"
                      }
                    >
                      <Money value={Number(row.gross_profit)} />
                    </Td>
                    <Td numeric>{formatPercent(Number(row.margin_percent))}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* Top products                                                       */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardHeader
            icon={Trophy}
            title="Top products by profit"
            description="What actually earns, not just what sells."
          />
          {topProducts.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Nothing sold in this range"
              instruction="Pick a wider range to see which products earn the most."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th numeric>Sold</Th>
                  <Th numeric>Revenue</Th>
                  <Th numeric>Gross profit</Th>
                  <Th numeric>Margin</Th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((row) => (
                  <tr key={row.product_id ?? row.product_name}>
                    <Td className="font-medium">{row.product_name}</Td>
                    <Td numeric>{Number(row.quantity_sold)}</Td>
                    <Td numeric>
                      <Money value={Number(row.revenue)} />
                    </Td>
                    <Td numeric className="font-semibold">
                      <Money value={Number(row.gross_profit)} />
                    </Td>
                    <Td numeric>{formatPercent(Number(row.margin_percent))}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Discounts                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader
          icon={HandCoins}
          title="Discounts given"
          description="Every price knocked down at the counter, biggest first."
          action={
            <ButtonLink
              href={`/api/export/discounts?${rangeQuery}`}
              icon={Download}
              size="sm"
              download
            >
              Export
            </ButtonLink>
          }
        />
        {discounts.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="Nothing was discounted"
            instruction="Every item in this range sold at its shelf price."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sold at</Th>
                <Th>Cashier</Th>
                <Th>Terminal</Th>
                <Th>Product</Th>
                <Th numeric>Qty</Th>
                <Th numeric>Shelf price</Th>
                <Th numeric>Sold for</Th>
                <Th numeric>Given away</Th>
                <Th>Flag</Th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((row, index) => (
                <tr key={`${row.sale_id}-${index}`}>
                  <Td className="num whitespace-nowrap text-ink-muted">
                    {new Date(row.sold_at).toLocaleString("en-PH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </Td>
                  <Td>{row.cashier_name ?? "—"}</Td>
                  <Td className="num text-ink-muted">{row.device_id ?? "—"}</Td>
                  <Td className="font-medium">{row.product_name}</Td>
                  <Td numeric>{row.quantity}</Td>
                  <Td numeric className="text-ink-muted">
                    <Money value={Number(row.list_price)} />
                  </Td>
                  <Td numeric>
                    <Money value={Number(row.unit_price)} />
                  </Td>
                  <Td numeric className="font-semibold">
                    <Money value={Number(row.discount_total)} />
                    <span className="mt-0.5 block text-caption font-normal text-ink-muted">
                      {formatPercent(Number(row.discount_percent))} off
                    </span>
                  </Td>
                  <Td>
                    {row.below_cost ? (
                      <Badge tone="danger" icon={TriangleAlert}>
                        Below cost
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Normal</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Who sold it                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader icon={UserRound} title="Per cashier" />
          {cashiers.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title="No sales in this range"
              instruction="Once a terminal syncs, each cashier's takings show here."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Cashier</Th>
                  <Th numeric>Sales</Th>
                  <Th numeric>Revenue</Th>
                  <Th numeric>Profit</Th>
                </tr>
              </thead>
              <tbody>
                {cashiers.map((row) => (
                  <tr key={row.user_id ?? row.cashier_name}>
                    <Td className="font-medium">{row.cashier_name}</Td>
                    <Td numeric>{Number(row.sales_count)}</Td>
                    <Td numeric>
                      <Money value={Number(row.revenue)} />
                    </Td>
                    <Td numeric className="font-semibold">
                      <Money value={Number(row.gross_profit)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader icon={Smartphone} title="Per terminal" />
          {devices.length === 0 ? (
            <EmptyState
              icon={Smartphone}
              title="No sales in this range"
              instruction="Each terminal appears here after it pushes its sales."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Terminal</Th>
                  <Th numeric>Sales</Th>
                  <Th numeric>Revenue</Th>
                  <Th numeric>Profit</Th>
                  <Th>Last sale</Th>
                </tr>
              </thead>
              <tbody>
                {devices.map((row) => (
                  <tr key={row.device_id}>
                    <Td className="num font-medium">{row.device_id}</Td>
                    <Td numeric>{Number(row.sales_count)}</Td>
                    <Td numeric>
                      <Money value={Number(row.revenue)} />
                    </Td>
                    <Td numeric className="font-semibold">
                      <Money value={Number(row.gross_profit)} />
                    </Td>
                    <Td className="num whitespace-nowrap text-ink-muted">
                      {row.last_sale_at === null
                        ? "—"
                        : new Date(row.last_sale_at).toLocaleString("en-PH", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* What is on the shelves                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Warehouse}
          label="Stock at cost"
          value={formatMoney(stockCost)}
          hint="Money tied up on the shelves"
        />
        <StatCard icon={Banknote} label="Stock at shelf price" value={formatMoney(stockRetail)} />
        <StatCard
          icon={Coins}
          label="Profit if it all sells"
          value={formatMoney(stockRetail - stockCost)}
          tone="success"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={Warehouse}
            title="Stock value by category"
            description={`${stockProductCount} products across ${valuation.length} categories, dearest first.`}
            action={
              <ButtonLink href="/api/export/valuation" icon={Download} size="sm" download>
                Export detail
              </ButtonLink>
            }
          />
          <div className="px-4 py-5 sm:px-6">
            {valuation.length === 0 ? (
              <EmptyState
                icon={Warehouse}
                title="Nothing on the shelves"
                instruction="Add products and record their opening stock in Inventory."
              />
            ) : (
              <DashboardBarChart
                items={valuation.map((row) => ({
                  label: `${row.category} (${row.productCount})`,
                  value: row.costValue,
                  display: formatMoney(row.costValue),
                }))}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={Snowflake}
            title="Dead stock"
            description="On the shelf, tying up money, not moving."
            action={<DeadStockDays days={deadStockDays} />}
          />
          {deadStock.length === 0 ? (
            <EmptyState
              icon={Snowflake}
              title="Everything is moving"
              instruction={`Every product in stock has sold within the last ${deadStockDays} days.`}
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Category</Th>
                  <Th numeric>Stock</Th>
                  <Th numeric>Tied up</Th>
                  <Th>Last sold</Th>
                </tr>
              </thead>
              <tbody>
                {deadStock.map((row) => (
                  <tr key={row.product_id}>
                    <Td className="font-medium">{row.product_name}</Td>
                    <Td className="text-ink-muted">{row.category ?? "—"}</Td>
                    <Td numeric>{row.stock_quantity}</Td>
                    <Td numeric className="font-semibold">
                      <Money value={Number(row.cost_value)} />
                    </Td>
                    <Td className="whitespace-nowrap">
                      {row.last_sold_at ? (
                        <span className="text-ink-muted">
                          {new Date(row.last_sold_at).toLocaleDateString("en-PH", {
                            dateStyle: "medium",
                          })}{" "}
                          ({row.days_since_sale} days ago)
                        </span>
                      ) : (
                        <Badge tone="warning">Never sold</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          icon={PackageSearch}
          title="Reorder list"
          description={
            reorder.length > 0
              ? `${reorder.length} products at or below their reorder point. ${formatMoney(restockCost)} to top them all up.`
              : "Products at or below their own reorder point."
          }
          action={
            <ButtonLink href="/api/export/reorder" icon={Download} size="sm" download>
              Export
            </ButtonLink>
          }
        />
        {reorder.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="Nothing needs reordering"
            instruction="A product lands here once it falls to its own reorder point. Set that per product on the Products page."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Category</Th>
                <Th numeric>Stock</Th>
                <Th numeric>Reorder at</Th>
                <Th numeric>Short by</Th>
                <Th numeric>Cost to restock</Th>
              </tr>
            </thead>
            <tbody>
              {reorderRows.map((row) => (
                <tr key={row.id}>
                  <Td className="font-medium">{row.name}</Td>
                  <Td className="text-ink-muted">{row.category ?? "—"}</Td>
                  <Td numeric className={row.stockQuantity <= 0 ? "font-semibold text-danger" : ""}>
                    {row.stockQuantity} {row.unit}
                  </Td>
                  <Td numeric className="text-ink-muted">
                    {row.reorderPoint}
                  </Td>
                  <Td numeric className="font-semibold">
                    {row.shortBy}
                  </Td>
                  <Td numeric>
                    <Money value={row.restockCost} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
