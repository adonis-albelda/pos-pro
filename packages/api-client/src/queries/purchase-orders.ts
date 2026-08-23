import {
  type PurchaseOrder,
  type PurchaseOrderItem,
  type PurchaseOrderPayment,
  type PurchaseOrderStatus,
  roundMoney,
} from "@double-a/shared-types";
import { ApiError, type ApiClient, type JsonApiPage, type JsonApiResource } from "../http";
import {
  type PurchaseOrderAttrs,
  type PurchaseOrderItemJson,
  type PurchaseOrderPaymentJson,
  toPurchaseOrderItem,
  toPurchaseOrderPayment,
  toPurchaseOrderWithLines,
} from "../mappers";
import { listSupplierBalances } from "./suppliers";

export type PurchaseOrderWithLines = PurchaseOrder & {
  items: PurchaseOrderItem[];
  payments: PurchaseOrderPayment[];
};

/**
 * GAP: the old `PurchaseOrderWithDetails` also carried `supplierName`
 * (joined from `suppliers(name)`). `PurchaseOrderResource` does not include
 * it — callers needing the supplier's name alongside a PO have to look it up
 * separately (see queries/suppliers.ts) and join client-side.
 */

export interface PurchaseOrdersFilter {
  supplierId?: string;
  status?: PurchaseOrderStatus;
  page?: number;
  pageSize?: number;
}

export async function listPurchaseOrdersPage(
  client: ApiClient,
  filter: PurchaseOrdersFilter = {},
): Promise<{ purchaseOrders: PurchaseOrderWithLines[]; total: number; lastPage: number }> {
  const page = await client.get<JsonApiPage<PurchaseOrderAttrs>>("/purchase-orders", {
    status: filter.status,
    supplier_id: filter.supplierId,
    page: filter.page ?? 1,
    per_page: filter.pageSize ?? 50,
  });

  return {
    purchaseOrders: page.data.map(toPurchaseOrderWithLines),
    total: page.meta?.total ?? page.data.length,
    lastPage: page.meta?.last_page ?? 1,
  };
}

/** Single-page fetch, mirroring the old `.limit(n)` query — not a full walk. */
export async function listPurchaseOrders(
  client: ApiClient,
  filter: PurchaseOrdersFilter & { limit?: number } = {},
): Promise<PurchaseOrderWithLines[]> {
  const result = await listPurchaseOrdersPage(client, {
    supplierId: filter.supplierId,
    status: filter.status,
    page: 1,
    pageSize: Math.min(filter.limit ?? 200, 200),
  });
  return result.purchaseOrders;
}

export async function getPurchaseOrder(
  client: ApiClient,
  id: string,
): Promise<PurchaseOrderWithLines | null> {
  try {
    const { data } = await client.get<{ data: JsonApiResource<PurchaseOrderAttrs> }>(
      `/purchase-orders/${id}`,
    );
    return toPurchaseOrderWithLines(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * `totalAmount` is server-computed (a trigger on Postgres, now Laravel-side
 * off `items`/`payments`) — never send it, so it is excluded from this type
 * entirely.
 */
export interface PurchaseOrderInput {
  supplierId: string;
  orderDate?: string | null;
  expectedDate?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
}

function toCreatePayload(input: PurchaseOrderInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { supplier_id: input.supplierId };
  if (input.orderDate !== undefined) payload.order_date = input.orderDate;
  if (input.expectedDate !== undefined) payload.expected_date = input.expectedDate;
  if (input.referenceNo !== undefined) payload.reference_no = input.referenceNo;
  if (input.notes !== undefined) payload.notes = input.notes;
  return payload;
}

/**
 * GAP: the old `createPurchaseOrder` inserted header + items + payment terms
 * in one call (three sequential, non-transactional inserts, but still a
 * single function). `StorePurchaseOrderController` only accepts header
 * fields — items and terms are separate nested POSTs
 * (`addPurchaseOrderItem` / `addPurchaseOrderPayment`) that need the new
 * order's id in the URL, so callers must create the header first, then add
 * each line/term afterward. No single call replaces the old all-in-one
 * write; a PO with no lines yet is visible and editable, same as before.
 */
export async function createPurchaseOrder(
  client: ApiClient,
  input: PurchaseOrderInput,
): Promise<PurchaseOrderWithLines> {
  const { data } = await client.post<{ data: JsonApiResource<PurchaseOrderAttrs> }>(
    "/purchase-orders",
    toCreatePayload(input),
  );
  return toPurchaseOrderWithLines(data);
}

/** `status` folded into the same PATCH as header edits — see `setPurchaseOrderStatus`. */
export interface PurchaseOrderPatch {
  status?: PurchaseOrderStatus;
  orderDate?: string;
  expectedDate?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
}

function toUpdatePayload(patch: PurchaseOrderPatch): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.orderDate !== undefined) payload.order_date = patch.orderDate;
  if (patch.expectedDate !== undefined) payload.expected_date = patch.expectedDate;
  if (patch.referenceNo !== undefined) payload.reference_no = patch.referenceNo;
  if (patch.notes !== undefined) payload.notes = patch.notes;
  return payload;
}

export async function updatePurchaseOrder(
  client: ApiClient,
  id: string,
  patch: PurchaseOrderPatch,
): Promise<PurchaseOrderWithLines> {
  const { data } = await client.patch<{ data: JsonApiResource<PurchaseOrderAttrs> }>(
    `/purchase-orders/${id}`,
    toUpdatePayload(patch),
  );
  return toPurchaseOrderWithLines(data);
}

/** draft -> ordered, (draft | ordered | partially_received) -> cancelled. Receiving drives the rest. */
export async function setPurchaseOrderStatus(
  client: ApiClient,
  id: string,
  status: PurchaseOrderStatus,
): Promise<PurchaseOrderWithLines> {
  return updatePurchaseOrder(client, id, { status });
}

/**
 * New capability — the old Supabase-backed query file never deleted a
 * purchase order. `DestroyPurchaseOrderController` is a hard delete.
 */
export async function deletePurchaseOrder(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/purchase-orders/${id}`);
}

export interface PurchaseOrderItemInput {
  productId?: string | null;
  productName: string;
  quantityOrdered: number;
  quantityReceived?: number;
  unitCost: number;
  note?: string | null;
}

function toItemPayload(input: Partial<PurchaseOrderItemInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.productId !== undefined) payload.product_id = input.productId;
  if (input.productName !== undefined) payload.product_name = input.productName;
  if (input.quantityOrdered !== undefined) payload.quantity_ordered = input.quantityOrdered;
  if (input.quantityReceived !== undefined) payload.quantity_received = input.quantityReceived;
  if (input.unitCost !== undefined) payload.unit_cost = input.unitCost;
  if (input.note !== undefined) payload.note = input.note;
  return payload;
}

/**
 * Draft-only editing — once ordered, lines are read-only except for
 * receiving. `product_name` is always client-supplied (snapshotted), even
 * when `productId` links a real product — `StorePurchaseOrderItemPayload`
 * requires it as a plain string, never resolved server-side from the product.
 */
export async function addPurchaseOrderItem(
  client: ApiClient,
  purchaseOrderId: string,
  input: PurchaseOrderItemInput,
): Promise<PurchaseOrderItem> {
  const { data } = await client.post<{ data: PurchaseOrderItemJson }>(
    `/purchase-orders/${purchaseOrderId}/items`,
    toItemPayload(input),
  );
  return toPurchaseOrderItem(data, purchaseOrderId);
}

/**
 * Also the receiving endpoint: sending `quantityReceived` pushes the parent
 * order's status forward server-side (`PurchaseOrderItemObserver`). The item
 * has no `purchaseOrderId` on the wire (`PurchaseOrderItemResource` is a flat,
 * non-nested shape) — the caller supplies it so the mapper can stamp it back on.
 */
export async function updatePurchaseOrderItem(
  client: ApiClient,
  itemId: string,
  purchaseOrderId: string,
  patch: Partial<PurchaseOrderItemInput>,
): Promise<PurchaseOrderItem> {
  const { data } = await client.patch<{ data: PurchaseOrderItemJson }>(
    `/purchase-orders/items/${itemId}`,
    toItemPayload(patch),
  );
  return toPurchaseOrderItem(data, purchaseOrderId);
}

export interface ReceivePurchaseOrderItemInput {
  itemId: string;
  purchaseOrderId: string;
  /** The line's `quantityReceived` before this receipt — read off the already-loaded PO detail. */
  currentQuantityReceived: number;
  /** How many units are being received right now. */
  quantity: number;
}

/**
 * GAP: the old `receivePurchaseOrderItem` fetched the item fresh
 * (`quantity_ordered`, `quantity_received`), validated the receipt against
 * "only N left to receive", then wrote the delta and an explicit restock
 * movement itself. `UpdatePurchaseOrderItemController` takes
 * `quantity_received` as an absolute value, not a delta, and there is no
 * `GET /purchase-orders/items/{id}` to refetch current state from — so the
 * caller must pass `currentQuantityReceived` off the already-loaded PO
 * detail. There is also no `min`/`max` guard against over-receiving in
 * `UpdatePurchaseOrderItemRequest`; whether that is still enforced (a DB
 * check constraint, same as before) or not is now purely a server-side
 * concern this client cannot see ahead of the request.
 */
export async function receivePurchaseOrderItem(
  client: ApiClient,
  input: ReceivePurchaseOrderItemInput,
): Promise<PurchaseOrderItem> {
  if (input.quantity <= 0) {
    throw new Error("Quantity received must be greater than zero");
  }

  return updatePurchaseOrderItem(client, input.itemId, input.purchaseOrderId, {
    quantityReceived: input.currentQuantityReceived + input.quantity,
  });
}

/**
 * Owner's remark on a single PO line. Unlike quantity/cost edits, a note is
 * allowed at any status. Empty string clears it back to null.
 */
export async function setPurchaseOrderItemNote(
  client: ApiClient,
  itemId: string,
  purchaseOrderId: string,
  note: string | null,
): Promise<PurchaseOrderItem> {
  const trimmed = note?.trim();
  return updatePurchaseOrderItem(client, itemId, purchaseOrderId, {
    note: trimmed ? trimmed : null,
  });
}

export async function deletePurchaseOrderItem(client: ApiClient, itemId: string): Promise<void> {
  await client.delete(`/purchase-orders/items/${itemId}`);
}

export interface PurchaseOrderPaymentInput {
  termNumber: number;
  dueDate?: string | null;
  amount: number;
  note?: string | null;
}

function toPaymentPayload(input: PurchaseOrderPaymentInput): Record<string, unknown> {
  return {
    term_number: input.termNumber,
    due_date: input.dueDate ?? null,
    amount: input.amount,
    note: input.note ?? null,
  };
}

export async function addPurchaseOrderPayment(
  client: ApiClient,
  purchaseOrderId: string,
  input: PurchaseOrderPaymentInput,
): Promise<PurchaseOrderPayment> {
  const { data } = await client.post<{ data: PurchaseOrderPaymentJson }>(
    `/purchase-orders/${purchaseOrderId}/payments`,
    toPaymentPayload(input),
  );
  return toPurchaseOrderPayment(data, purchaseOrderId);
}

/**
 * `paidDate` is left off the body when not given — the payload class only
 * defaults to today when the key is entirely absent from the request
 * (`isset($data['paid_date'])`); sending an explicit `null` would not get
 * the same "default to today" treatment server-side.
 */
export async function markPaymentPaid(
  client: ApiClient,
  paymentId: string,
  purchaseOrderId: string,
  paidDate?: string,
): Promise<PurchaseOrderPayment> {
  const body: Record<string, unknown> = { is_paid: true };
  if (paidDate !== undefined) body.paid_date = paidDate;

  const { data } = await client.patch<{ data: PurchaseOrderPaymentJson }>(
    `/purchase-orders/payments/${paymentId}`,
    body,
  );
  return toPurchaseOrderPayment(data, purchaseOrderId);
}

/** `paid_date` is always cleared to null server-side when `is_paid` is false. */
export async function markPaymentUnpaid(
  client: ApiClient,
  paymentId: string,
  purchaseOrderId: string,
): Promise<PurchaseOrderPayment> {
  const { data } = await client.patch<{ data: PurchaseOrderPaymentJson }>(
    `/purchase-orders/payments/${paymentId}`,
    { is_paid: false },
  );
  return toPurchaseOrderPayment(data, purchaseOrderId);
}

/**
 * GAP: no aggregate endpoint (the old query did one Postgres count with
 * `.in("status", [...])`). Two count-only page requests (`pageSize: 1`, same
 * trick as `countProducts` in products.ts) instead of one round trip.
 */
export async function countOpenPurchaseOrders(client: ApiClient): Promise<number> {
  const [ordered, partial] = await Promise.all([
    listPurchaseOrdersPage(client, { status: "ordered", page: 1, pageSize: 1 }),
    listPurchaseOrdersPage(client, { status: "partially_received", page: 1, pageSize: 1 }),
  ]);
  return ordered.total + partial.total;
}

/**
 * `GET /suppliers/balances` (`IndexSupplierBalancesController`) already
 * sums unpaid `purchase_order_payments` across non-cancelled POs, grouped
 * by supplier, in one query — the exact same definition this used to
 * rebuild by walking every purchase order page and summing client-side.
 * One call instead of N; this fires on every dashboard-home visit.
 */
export async function sumSupplierBalance(client: ApiClient): Promise<number> {
  const balances = await listSupplierBalances(client);
  return roundMoney(Object.values(balances).reduce((sum, balance) => sum + balance, 0));
}

export interface UpcomingSupplierPayment {
  id: string;
  termNumber: number;
  dueDate: string | null;
  amount: number;
  isPaid: boolean;
  paidDate: string | null;
  note: string | null;
}

/**
 * GAP: `UpcomingPaymentsController` (`GET /purchase-orders/payments/upcoming`)
 * takes no query params at all — no `days` cutoff, no `.limit(20)`, unlike
 * the old `listUpcomingSupplierPayments(client, days)`. It also returns the
 * flat `PurchaseOrderPaymentResource`, which — unlike the old query's join
 * through `purchase_orders!inner(status, suppliers(name))` — carries no
 * `purchaseOrderId`, `supplierName`, or the parent PO's `status`. That last
 * one means a cancelled PO's still-unpaid terms are NOT excluded here,
 * unlike the old query's `.neq("purchase_orders.status", "cancelled")` —
 * and there is no client-side way to filter them out, since the response
 * carries no link back to the PO. `days` and a result cap are still applied
 * client-side below; the cancelled-PO and supplier-name gaps are not
 * fixable from this client — ask backend for the join back to the PO if the
 * dashboard card needs either.
 */
export async function listUpcomingSupplierPayments(
  client: ApiClient,
  days?: number,
): Promise<UpcomingSupplierPayment[]> {
  const { data } = await client.get<{ data: PurchaseOrderPaymentJson[] }>(
    "/purchase-orders/payments/upcoming",
  );

  const rows = data
    .map((row) => ({
      id: row.id,
      termNumber: row.term_number,
      dueDate: row.due_date,
      amount: Number(row.amount),
      isPaid: row.is_paid,
      paidDate: row.paid_date,
      note: row.note,
    }))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  if (days === undefined) return rows.slice(0, 20);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffDay = cutoff.toISOString().slice(0, 10);

  return rows.filter((row) => row.dueDate !== null && row.dueDate <= cutoffDay).slice(0, 20);
}
