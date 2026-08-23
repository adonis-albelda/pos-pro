import type { InventoryMovement, Product } from "@double-a/shared-types";
import type { ApiClient, JsonApiPage, JsonApiResource } from "../http";
import { type InventoryMovementAttrs, type ProductAttrs, toInventoryMovement, toProduct } from "../mappers";

/**
 * Stock only ever moves through `inventory_movements` — this domain is
 * read-only from the client. Writes go through `adjustStock()` in
 * products.ts (`POST /products/{id}/adjust-stock`), which already exists;
 * nothing here creates or updates a movement.
 */

/**
 * `GET /inventory/movements` (IndexInventoryMovementsController) accepts
 * `product_id`, `reference_id` (e.g. a sale id, for its stock-effect rows),
 * and `per_page` — capped server-side at 200. The old PostgREST
 * `MovementFilter` also supported `productIds` (batch), `reasons`, and a
 * `from`/`to` date range; those are still dropped from the type rather than
 * silently ignored if passed. Ask backend to extend the endpoint before
 * porting a call site that needs them.
 */
export interface MovementFilter {
  productId?: string;
  referenceId?: string;
}

export async function listMovementsPage(
  client: ApiClient,
  options: MovementFilter & { page?: number; pageSize?: number } = {},
): Promise<{ movements: InventoryMovement[]; total: number; lastPage: number }> {
  const page = await client.get<JsonApiPage<InventoryMovementAttrs>>("/inventory/movements", {
    product_id: options.productId,
    reference_id: options.referenceId,
    page: options.page ?? 1,
    per_page: options.pageSize ?? 50,
  });

  return {
    movements: page.data.map(toInventoryMovement),
    total: page.meta?.total ?? page.data.length,
    lastPage: page.meta?.last_page ?? 1,
  };
}

/** Most recent movements matching the filter, single page — mirrors the old `.limit(n)` query. */
export async function listMovements(
  client: ApiClient,
  options: MovementFilter & { limit?: number } = {},
): Promise<InventoryMovement[]> {
  const result = await listMovementsPage(client, {
    productId: options.productId,
    page: 1,
    pageSize: Math.min(options.limit ?? 100, 200),
  });
  return result.movements;
}

export interface MovementTotals {
  /** Units added: restocks, corrections up, voided sales coming back. */
  stockIn: number;
  /** Units taken out, as a positive number. */
  stockOut: number;
  net: number;
  count: number;
}

/**
 * `GET /inventory/movements/totals` (`MovementTotalsController`) — one SQL
 * aggregate, not a client-side walk of every movement page. Used to scan up
 * to 20,000 rows shop-wide whenever no product was focused, on every visit
 * to the Movements tab. `cap` is accepted for call-site compatibility but no
 * longer meaningful — a real aggregate has nothing to cap.
 */
export async function sumMovements(
  client: ApiClient,
  options: MovementFilter & { cap?: number } = {},
): Promise<MovementTotals> {
  const { data } = await client.get<{
    data: { stock_in: number; stock_out: number; net: number; count: number };
  }>("/inventory/movements/totals", { product_id: options.productId });

  return {
    stockIn: Number(data.stock_in),
    stockOut: Number(data.stock_out),
    net: Number(data.net),
    count: data.count,
  };
}

/**
 * Negative stock, which is what an oversell looks like after two offline
 * devices both sold the last unit. Flagged for manual resolution rather than
 * prevented. `OversoldProductsController` returns a standard `ProductResource`
 * collection (unpaginated), so this reuses `toProduct` like `listBelowReorder`.
 */
export async function listOversold(client: ApiClient): Promise<Product[]> {
  const { data } = await client.get<{ data: JsonApiResource<ProductAttrs>[] }>("/inventory/oversold");
  return data.map(toProduct);
}

export interface StockReconciliationRow {
  id: string;
  name: string;
  stockQuantity: number;
  movementTotal: number;
  drift: number;
}

interface StockReconciliationJson {
  id: string;
  name: string;
  stock_quantity: number;
  movement_total: number;
  drift: number;
}

/**
 * Ports the `stock_reconciliation` view: `stock_quantity` should always
 * equal the sum of a product's movements, so a non-empty result means
 * something wrote stock outside the movement log. `StockReconciliationController`
 * returns a plain `{ data: [...] }` array (`JsonResponse`, not a JSON:API
 * resource collection) — modeled as a plain interface rather than
 * `JsonApiResource`.
 */
export async function listReconciliation(client: ApiClient): Promise<StockReconciliationRow[]> {
  const { data } = await client.get<{ data: StockReconciliationJson[] }>("/inventory/reconciliation");
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    stockQuantity: Number(row.stock_quantity),
    movementTotal: Number(row.movement_total),
    drift: Number(row.drift),
  }));
}
