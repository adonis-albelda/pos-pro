import * as Crypto from "expo-crypto";
import {
  cartDiscount,
  cartTotal,
  isPaidByDefault,
  lineSubtotal,
  normaliseCustomerDetails,
  roundMoney,
  type CartLine,
  type CustomerDetails,
  type Fulfillment,
  type LocalSale,
  type LocalSaleWithItems,
  type PaymentMethod,
  type SaleItem,
  type SaleItemAddon,
} from "@double-a/shared-types";
import { getDb } from "./index";
import { getEnrolledCompanyId, getActiveLocationId } from "@/lib/device";

interface SaleRow {
  id: string;
  invoice_number: string | null;
  user_id: string | null;
  total_amount: number;
  discount_amount: number | null;
  payment_method: string | null;
  status: string;
  device_id: string | null;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_address: string | null;
  customer_contact: string | null;
  is_paid: number | null;
  fulfillment: string | null;
  delivery_completed: number | null;
  flags_pending: number | null;
  sync_status: string;
  synced_at: string | null;
  company_id: string | null;
  location_id: string | null;
}

interface SaleItemRow {
  id: string;
  sale_id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  list_price: number | null;
  unit_cost: number | null;
  subtotal: number;
  addons: string | null;
}

function parseLocalAddons(json: string | null): SaleItemAddon[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as SaleItemAddon[]) : [];
  } catch {
    return [];
  }
}

function toLocalSale(row: SaleRow): LocalSale {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    userId: row.user_id,
    totalAmount: row.total_amount,
    discountAmount: row.discount_amount ?? 0,
    paymentMethod: row.payment_method as PaymentMethod | null,
    status: row.status as LocalSale["status"],
    deviceId: row.device_id,
    createdAt: row.created_at,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerAddress: row.customer_address,
    customerContact: row.customer_contact,
    isPaid: (row.is_paid ?? 1) === 1,
    fulfillment: (row.fulfillment as Fulfillment) ?? "pickup",
    deliveryCompleted: (row.delivery_completed ?? 0) === 1,
    companyId: row.company_id,
    locationId: row.location_id,
    syncStatus: row.sync_status as LocalSale["syncStatus"],
    syncedAt: row.synced_at,
  };
}

function toLocalSaleItem(row: SaleItemRow): SaleItem {
  return {
    id: row.id,
    saleId: row.sale_id,
    productId: row.product_id,
    variantId: row.variant_id,
    productName: row.product_name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    listPrice: row.list_price ? row.list_price : row.unit_price,
    unitCost: row.unit_cost ?? 0,
    subtotal: row.subtotal,
    // Replacing a line item is admin-only (apps/admin), never happens on a
    // POS terminal's own local copy of a sale.
    replacedByProductId: null,
    replacedByProductName: null,
    addons: parseLocalAddons(row.addons),
  };
}

export interface CompleteSaleInput {
  lines: CartLine[];
  userId: string;
  deviceId: string;
  paymentMethod: PaymentMethod;
  customer?: CustomerDetails;
  fulfillment?: Fulfillment;
}

export async function completeSale(
  input: CompleteSaleInput,
): Promise<LocalSaleWithItems> {
  const db = getDb();

  const saleId = Crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const total = cartTotal(input.lines);
  const discount = cartDiscount(input.lines);
  const customer = normaliseCustomerDetails(input.customer ?? {});
  const fulfillment = input.fulfillment ?? "pickup";
  const isPaid = isPaidByDefault(input.paymentMethod);
  const deliveryCompleted = false;

  const items: SaleItem[] = input.lines.map((line) => ({
    id: Crypto.randomUUID(),
    saleId,
    productId: line.productId,
    variantId: line.variantId ?? null,
    productName: line.productName,
    quantity: line.quantity,
    unitPrice: roundMoney(line.unitPrice),
    listPrice: roundMoney(line.listPrice),
    unitCost: roundMoney(line.unitCost),
    subtotal: lineSubtotal(line.unitPrice, line.quantity),
    replacedByProductId: null,
    replacedByProductName: null,
    addons: (line.addons ?? []).map((addon) => ({
      id: Crypto.randomUUID(),
      addonGroupItemId: addon.addonGroupItemId,
      quantity: addon.quantity,
      priceAtPurchase: roundMoney(addon.price),
      nameSnapshot: addon.name,
    })),
  }));

  const companyId = await getEnrolledCompanyId();
  const locationId = await getActiveLocationId();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO sales
         (id, user_id, total_amount, discount_amount, payment_method, status, device_id, created_at,
          customer_id, customer_name, customer_address, customer_contact,
          is_paid, fulfillment, delivery_completed, flags_pending, sync_status, company_id, location_id)
       VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?)`,
      saleId,
      input.userId,
      total,
      discount,
      input.paymentMethod,
      input.deviceId,
      createdAt,
      customer.customerId,
      customer.name,
      customer.address,
      customer.contact,
      isPaid ? 1 : 0,
      fulfillment,
      deliveryCompleted ? 1 : 0,
      companyId,
      locationId,
    );

    for (const item of items) {
      await db.runAsync(
        `INSERT INTO sale_items
           (id, sale_id, product_id, variant_id, product_name, quantity, unit_price, list_price, unit_cost, subtotal, addons)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.id,
        item.saleId,
        item.productId,
        item.variantId,
        item.productName,
        item.quantity,
        item.unitPrice,
        item.listPrice,
        item.unitCost,
        item.subtotal,
        JSON.stringify(item.addons),
      );
    }
  });

  return {
    id: saleId,
    invoiceNumber: null,
    userId: input.userId,
    totalAmount: total,
    discountAmount: discount,
    paymentMethod: input.paymentMethod,
    status: "completed",
    deviceId: input.deviceId,
    createdAt,
    customerId: customer.customerId,
    customerName: customer.name,
    customerAddress: customer.address,
    customerContact: customer.contact,
    isPaid,
    fulfillment,
    deliveryCompleted,
    companyId,
    locationId,
    syncStatus: "pending",
    syncedAt: null,
    items,
  };
}

export async function updateLocalSaleFlags(
  saleId: string,
  patch: { isPaid?: boolean; deliveryCompleted?: boolean },
): Promise<void> {
  const db = getDb();
  const row = await db.getFirstAsync<{
    sync_status: string;
    is_paid: number;
    delivery_completed: number;
  }>("SELECT sync_status, is_paid, delivery_completed FROM sales WHERE id = ?", saleId);

  if (!row) throw new Error("That sale is no longer on this device.");

  const isPaid = patch.isPaid ?? row.is_paid === 1;
  const deliveryCompleted = patch.deliveryCompleted ?? row.delivery_completed === 1;
  const flagsPending = row.sync_status === "synced" ? 1 : 0;

  await db.runAsync(
    `UPDATE sales
        SET is_paid = ?, delivery_completed = ?, flags_pending = ?
      WHERE id = ?`,
    isPaid ? 1 : 0,
    deliveryCompleted ? 1 : 0,
    flagsPending,
    saleId,
  );
}

export async function listOpenDeliveries(): Promise<LocalSaleWithItems[]> {
  const sales = await getDb().getAllAsync<SaleRow>(
    `SELECT * FROM sales
      WHERE fulfillment = 'delivery'
        AND delivery_completed = 0
        AND status = 'completed'
      ORDER BY created_at DESC`,
  );
  return hydrateSales(sales);
}

export async function listFlagPendingSales(): Promise<LocalSale[]> {
  const rows = await getDb().getAllAsync<SaleRow>(
    "SELECT * FROM sales WHERE flags_pending = 1 ORDER BY created_at",
  );
  return rows.map(toLocalSale);
}

export async function markFlagsSynced(saleIds: string[]): Promise<void> {
  if (saleIds.length === 0) return;
  const placeholders = saleIds.map(() => "?").join(", ");
  await getDb().runAsync(
    `UPDATE sales SET flags_pending = 0 WHERE id IN (${placeholders})`,
    ...saleIds,
  );
}

async function hydrateSales(sales: SaleRow[]): Promise<LocalSaleWithItems[]> {
  if (sales.length === 0) return [];

  const placeholders = sales.map(() => "?").join(", ");
  const items = await getDb().getAllAsync<SaleItemRow>(
    `SELECT * FROM sale_items WHERE sale_id IN (${placeholders})`,
    ...sales.map((sale) => sale.id),
  );

  const bySale = new Map<string, SaleItem[]>();
  for (const row of items) {
    const list = bySale.get(row.sale_id) ?? [];
    list.push(toLocalSaleItem(row));
    bySale.set(row.sale_id, list);
  }

  return sales.map((sale) => ({
    ...toLocalSale(sale),
    items: bySale.get(sale.id) ?? [],
  }));
}

export async function getLocalSale(
  saleId: string,
): Promise<LocalSaleWithItems | null> {
  const sale = await getDb().getFirstAsync<SaleRow>(
    "SELECT * FROM sales WHERE id = ?",
    saleId,
  );
  if (!sale) return null;

  const items = await getDb().getAllAsync<SaleItemRow>(
    "SELECT * FROM sale_items WHERE sale_id = ?",
    saleId,
  );

  return { ...toLocalSale(sale), items: items.map(toLocalSaleItem) };
}

export async function listLocalSales(
  limit = 100,
): Promise<LocalSaleWithItems[]> {
  const sales = await getDb().getAllAsync<SaleRow>(
    "SELECT * FROM sales ORDER BY created_at DESC LIMIT ?",
    limit,
  );
  return hydrateSales(sales);
}

export async function listPendingSales(): Promise<LocalSaleWithItems[]> {
  const sales = await getDb().getAllAsync<SaleRow>(
    "SELECT * FROM sales WHERE sync_status = 'pending' ORDER BY created_at",
  );
  return hydrateSales(sales);
}

export async function countPendingSales(): Promise<number> {
  const row = await getDb().getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sales WHERE sync_status = 'pending'",
  );
  return row?.count ?? 0;
}

export async function markSalesSynced(
  saleIds: string[],
  syncedAt: string,
  invoiceNumbers: Record<string, string> = {},
): Promise<void> {
  if (saleIds.length === 0) return;

  const db = getDb();
  const placeholders = saleIds.map(() => "?").join(", ");
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE sales SET sync_status = 'synced', synced_at = ?
        WHERE id IN (${placeholders})`,
      syncedAt,
      ...saleIds,
    );

    for (const [saleId, invoiceNumber] of Object.entries(invoiceNumbers)) {
      await db.runAsync(
        "UPDATE sales SET invoice_number = ? WHERE id = ?",
        invoiceNumber,
        saleId,
      );
    }
  });
}

export async function markSalesFailed(saleIds: string[]): Promise<void> {
  if (saleIds.length === 0) return;

  const placeholders = saleIds.map(() => "?").join(", ");
  await getDb().runAsync(
    `UPDATE sales SET sync_status = 'pending' WHERE id IN (${placeholders})`,
    ...saleIds,
  );
}

export async function voidPendingSale(saleId: string): Promise<void> {
  const db = getDb();
  const sale = await db.getFirstAsync<{ sync_status: string }>(
    "SELECT sync_status FROM sales WHERE id = ?",
    saleId,
  );

  if (!sale) throw new Error("That sale is no longer on this device.");
  if (sale.sync_status !== "pending") {
    throw new Error(
      "This sale has already synced. Void it from the admin dashboard so stock goes back.",
    );
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM sale_items WHERE sale_id = ?", saleId);
    await db.runAsync("DELETE FROM sales WHERE id = ?", saleId);
  });
}

export interface LocalDaySummary {
  salesCount: number;
  revenue: number;
  itemsSold: number;
  pendingCount: number;
}

export async function summariseToday(): Promise<LocalDaySummary> {
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();

  const db = getDb();
  const totals = await db.getFirstAsync<{
    sales_count: number;
    revenue: number | null;
    pending_count: number;
  }>(
    `SELECT COUNT(*) AS sales_count,
            SUM(total_amount) AS revenue,
            SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END) AS pending_count
       FROM sales
      WHERE created_at >= ? AND status = 'completed'`,
    startOfDay,
  );

  const items = await db.getFirstAsync<{ items_sold: number | null }>(
    `SELECT SUM(si.quantity) AS items_sold
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
      WHERE s.created_at >= ? AND s.status = 'completed'`,
    startOfDay,
  );

  return {
    salesCount: totals?.sales_count ?? 0,
    revenue: roundMoney(totals?.revenue ?? 0),
    itemsSold: items?.items_sold ?? 0,
    pendingCount: totals?.pending_count ?? 0,
  };
}
