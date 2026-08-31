import type { ApiClient, DataEnvelope } from "../http";

/**
 * Ports the old Postgres `report_*()` RPCs to `GET /reports/*`. Every report
 * still assumes an admin caller — Laravel throws 403 for anyone else, same
 * as the old function-level check. None of these read `expenses`; Net
 * (revenue − expenses) is a dashboard-level composition of `reportProfit`
 * with `packages/api-client/src/queries/expenses.ts`, not something built
 * here (CLAUDE.md §14).
 *
 * These endpoints return a plain `{ data, meta? }` envelope, not JSON:API
 * (`{ data: { type, id, attributes } }`) — every row is already a flat
 * object, so no mapper is needed, just a row interface per report.
 */

export interface DateRange {
  /** Inclusive ISO timestamp. */
  from: string;
  /** Exclusive ISO timestamp. */
  to: string;
}

/** One row per shop-day (Asia/Manila), voided sales excluded. */
export interface ProfitReportRow {
  bucket: string;
  sales_count: number;
  items_sold: number;
  revenue: number;
  discount: number;
  cost: number;
  gross_profit: number;
  margin_percent: number;
}

export interface TopProductReportRow {
  product_id: string | null;
  product_name: string;
  category: string | null;
  quantity_sold: number;
  revenue: number;
  cost: number;
  gross_profit: number;
  margin_percent: number;
}

export interface DiscountReportRow {
  sale_id: string;
  sold_at: string;
  cashier_name: string | null;
  device_id: string | null;
  product_name: string;
  quantity: number;
  list_price: number;
  unit_price: number;
  discount_total: number;
  discount_percent: number;
  below_cost: boolean;
}

export interface CashierReportRow {
  user_id: string | null;
  cashier_name: string;
  sales_count: number;
  revenue: number;
  discount: number;
  gross_profit: number;
  average_sale: number;
}

export interface DeviceReportRow {
  device_id: string;
  sales_count: number;
  revenue: number;
  gross_profit: number;
  last_sale_at: string | null;
}

export interface InventoryValuationReportRow {
  product_id: string;
  product_name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  stock_quantity: number;
  cost_price: number;
  price: number;
  cost_value: number;
  retail_value: number;
  potential_profit: number;
}

export interface InventoryValuationSummaryRow {
  category: string;
  productCount: number;
  stockQuantity: number;
  costValue: number;
  retailValue: number;
  potentialProfit: number;
}

export interface DeadStockReportRow {
  product_id: string;
  product_name: string;
  sku: string | null;
  category: string | null;
  stock_quantity: number;
  cost_value: number;
  last_sold_at: string | null;
  days_since_sale: number | null;
}

export async function reportProfit(client: ApiClient, range: DateRange): Promise<ProfitReportRow[]> {
  const { data } = await client.get<DataEnvelope<ProfitReportRow[]>>("/reports/profit", {
    from: range.from,
    to: range.to,
  });
  return data;
}

export async function reportTopProducts(
  client: ApiClient,
  range: DateRange,
  limit = 20,
): Promise<TopProductReportRow[]> {
  const { data } = await client.get<DataEnvelope<TopProductReportRow[]>>("/reports/top-products", {
    from: range.from,
    to: range.to,
    limit,
  });
  return data;
}

export async function reportDiscounts(client: ApiClient, range: DateRange): Promise<DiscountReportRow[]> {
  const { data } = await client.get<DataEnvelope<DiscountReportRow[]>>("/reports/discounts", {
    from: range.from,
    to: range.to,
  });
  return data;
}

export async function reportByCashier(client: ApiClient, range: DateRange): Promise<CashierReportRow[]> {
  const { data } = await client.get<DataEnvelope<CashierReportRow[]>>("/reports/by-cashier", {
    from: range.from,
    to: range.to,
  });
  return data;
}

export async function reportByDevice(client: ApiClient, range: DateRange): Promise<DeviceReportRow[]> {
  const { data } = await client.get<DataEnvelope<DeviceReportRow[]>>("/reports/by-device", {
    from: range.from,
    to: range.to,
  });
  return data;
}

/** No date range — a snapshot of what's on the shelves right now. */
export async function reportInventoryValuation(client: ApiClient): Promise<InventoryValuationReportRow[]> {
  const { data } = await client.get<DataEnvelope<InventoryValuationReportRow[]>>("/reports/inventory-valuation");
  return data;
}

/**
 * Grouped by category — a few dozen rows regardless of catalogue size, unlike
 * reportInventoryValuation() above (one row per product). What the reports
 * page's own Stock value chart reads; the full per-product breakdown stays
 * available only through the CSV export, not this endpoint.
 */
export async function reportInventoryValuationSummary(
  client: ApiClient,
): Promise<InventoryValuationSummaryRow[]> {
  const { data } = await client.get<
    DataEnvelope<
      {
        category: string;
        product_count: number;
        stock_quantity: number;
        cost_value: number;
        retail_value: number;
        potential_profit: number;
      }[]
    >
  >("/reports/inventory-valuation/summary");

  return data.map((row) => ({
    category: row.category,
    productCount: row.product_count,
    stockQuantity: Number(row.stock_quantity),
    costValue: Number(row.cost_value),
    retailValue: Number(row.retail_value),
    potentialProfit: Number(row.potential_profit),
  }));
}

export async function reportDeadStock(client: ApiClient, days = 60): Promise<DeadStockReportRow[]> {
  const { data } = await client.get<DataEnvelope<DeadStockReportRow[]>>("/reports/dead-stock", { days });
  return data;
}

/** Totals for the profit report's header cards. */
export function summariseProfit(rows: ProfitReportRow[]) {
  const revenue = rows.reduce((sum, row) => sum + Number(row.revenue), 0);
  const cost = rows.reduce((sum, row) => sum + Number(row.cost), 0);
  const discount = rows.reduce((sum, row) => sum + Number(row.discount), 0);
  const salesCount = rows.reduce((sum, row) => sum + Number(row.sales_count), 0);
  const itemsSold = rows.reduce((sum, row) => sum + Number(row.items_sold), 0);
  const grossProfit = revenue - cost;

  return {
    revenue,
    cost,
    discount,
    salesCount,
    itemsSold,
    grossProfit,
    marginPercent: revenue === 0 ? 0 : Math.round((grossProfit / revenue) * 1000) / 10,
  };
}
