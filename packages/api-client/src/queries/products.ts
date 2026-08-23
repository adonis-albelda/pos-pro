import type { Product } from "@double-a/shared-types";
import { ApiError, type ApiClient, type JsonApiPage, type JsonApiResource } from "../http";
import { type ProductAttrs, toProduct } from "../mappers";

export interface ProductInput {
  name: string;
  sku?: string | null;
  price: number;
  costPrice: number;
  categoryId?: string | null;
  unit: string;
  barcode?: string | null;
  reorderPoint?: number;
  bulkPrice?: number | null;
  bulkMinQuantity?: number | null;
  allowDecimal?: boolean;
  isActive?: boolean;
}

function toPayload(input: Partial<ProductInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.sku !== undefined) payload.sku = input.sku;
  if (input.price !== undefined) payload.price = input.price;
  if (input.costPrice !== undefined) payload.cost_price = input.costPrice;
  if (input.categoryId !== undefined) payload.category_id = input.categoryId;
  if (input.unit !== undefined) payload.unit = input.unit;
  if (input.barcode !== undefined) payload.barcode = input.barcode;
  if (input.reorderPoint !== undefined) payload.reorder_point = input.reorderPoint;
  if (input.bulkPrice !== undefined) payload.bulk_price = input.bulkPrice;
  if (input.bulkMinQuantity !== undefined) payload.bulk_min_quantity = input.bulkMinQuantity;
  if (input.allowDecimal !== undefined) payload.allow_decimal = input.allowDecimal;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  return payload;
}

export type ProductStockState = "attention" | "low" | "out" | "oversold" | "healthy" | "hidden";
export type ProductSort = "stock-asc" | "stock-desc" | "short-desc" | "value-desc";

export interface ListProductsPageOptions {
  q?: string;
  page?: number;
  pageSize?: number;
  includeInactive?: boolean;
  categoryId?: string;
  /** Server-computed from stock_quantity/reorder_point/is_active — ignores `includeInactive` when given (see IndexProductsController). */
  state?: ProductStockState;
  sort?: ProductSort;
}

export async function listProductsPage(
  client: ApiClient,
  options: ListProductsPageOptions = {},
): Promise<{ products: Product[]; total: number; lastPage: number }> {
  const page = await client.get<JsonApiPage<ProductAttrs>>("/products", {
    search: options.q,
    category_id: options.categoryId,
    is_active: options.state || options.includeInactive ? undefined : true,
    state: options.state,
    sort: options.sort,
    page: options.page ?? 1,
    per_page: options.pageSize ?? 25,
  });

  return {
    products: page.data.map(toProduct),
    total: page.meta?.total ?? page.data.length,
    lastPage: page.meta?.last_page ?? 1,
  };
}

export interface ProductStats {
  tracked: number;
  stockCost: number;
  needsReordering: number;
  oversold: number;
  hidden: number;
}

/**
 * `GET /products/stats` (`ProductStatsController`) — one aggregate query for
 * the Inventory page's header stat cards, instead of walking the whole
 * catalogue into the browser just to add four numbers up.
 */
export async function getProductStats(client: ApiClient): Promise<ProductStats> {
  const { data } = await client.get<{
    data: {
      tracked: number;
      stock_cost: number;
      needs_reordering: number;
      oversold: number;
      hidden: number;
    };
  }>("/products/stats");

  return {
    tracked: data.tracked,
    stockCost: Number(data.stock_cost),
    needsReordering: data.needs_reordering,
    oversold: data.oversold,
    hidden: data.hidden,
  };
}

/**
 * Walks every page. Same "load the whole catalogue" contract the old
 * PostgREST-backed `fetchAllPages` gave callers — now paid for in page-count
 * round trips instead of Range headers.
 */
export async function listProducts(
  client: ApiClient,
  options: { includeInactive?: boolean } = {},
): Promise<Product[]> {
  const products: Product[] = [];
  let page = 1;
  for (;;) {
    const result = await listProductsPage(client, {
      page,
      pageSize: 200,
      includeInactive: options.includeInactive,
    });
    products.push(...result.products);
    if (page >= result.lastPage) return products;
    page += 1;
  }
}

export async function countProducts(
  client: ApiClient,
  options: { includeInactive?: boolean } = {},
): Promise<number> {
  const result = await listProductsPage(client, { page: 1, pageSize: 1, includeInactive: options.includeInactive });
  return result.total;
}

/** One line read off a notebook photo — see ExtractProductsFromPhotoAction (Laravel). No category: that match happens client-side against the tenant's own category tree. */
export interface ExtractedProductLine {
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  costPrice: number | null;
  unit: string;
}

interface ExtractedProductLineAttrs {
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  cost_price: number | null;
  unit: string;
}

/** OCR runs server-side (Tesseract on the API host) — see CLAUDE.md notes on apps/admin's from-photo feature. */
export async function extractProductsFromPhoto(
  client: ApiClient,
  image: File,
): Promise<ExtractedProductLine[]> {
  const formData = new FormData();
  formData.set("image", image);

  const result = await client.postMultipart<{ data: ExtractedProductLineAttrs[] }>(
    "/products/extract-from-photo",
    formData,
  );

  return result.data.map((line) => ({
    name: line.name,
    sku: line.sku,
    barcode: line.barcode,
    price: line.price,
    costPrice: line.cost_price,
    unit: line.unit,
  }));
}

/**
 * No batch-by-id endpoint on the Tally API. Falls back to N parallel
 * `GET /products/{id}` calls — fine for a cart-sized list, not for a large
 * report. Ask backend for a batch endpoint if a caller needs more than a
 * couple dozen ids at once.
 */
export async function listProductsByIds(client: ApiClient, ids: string[]): Promise<Product[]> {
  const unique = [...new Set(ids)];
  const results = await Promise.all(unique.map((id) => getProduct(client, id)));
  return results.filter((p): p is Product => p !== null);
}

/**
 * No server-side id-search endpoint — walks the search-filtered listing
 * client-side. Fine for admin's typeahead-sized result sets; `cap` is a
 * safety net against a broad search term matching most of the catalogue,
 * not a limit this is expected to hit in normal use.
 */
export async function findProductIdsMatching(
  client: ApiClient,
  q: string,
  options: { includeInactive?: boolean; cap?: number } = {},
): Promise<string[]> {
  const needle = q.trim();
  if (!needle) return [];

  const cap = options.cap ?? 2000;
  const ids: string[] = [];
  let page = 1;
  for (; ids.length < cap; page += 1) {
    const result = await listProductsPage(client, {
      q: needle,
      page,
      pageSize: 200,
      includeInactive: options.includeInactive,
    });
    ids.push(...result.products.map((p) => p.id));
    if (page >= result.lastPage) break;
  }
  return ids;
}

/**
 * One grouped query server-side (`GET /categories/product-counts`) — used
 * to walk the entire catalogue client-side just to tally this (same cost as
 * `listProducts`), which made the categories page slow for any shop-sized
 * catalogue. Same `is_active` semantics as `listProductsPage`: omitting
 * the param (includeInactive: true) counts both active and inactive.
 */
export async function countProductsByCategory(
  client: ApiClient,
  options: { includeInactive?: boolean } = {},
): Promise<Record<string, number>> {
  const { data } = await client.get<{ data: Record<string, number> }>("/categories/product-counts", {
    is_active: options.includeInactive ? undefined : true,
  });
  return data;
}

export async function getProduct(client: ApiClient, id: string): Promise<Product | null> {
  try {
    const { data } = await client.get<{ data: JsonApiResource<ProductAttrs> }>(`/products/${id}`);
    return toProduct(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Incremental fetch for the mobile pull step is now handled server-side by
 * `GET /pos/sync/pull?since=`, which returns products in the same response
 * as categories/customers/settings — see queries/pos.ts. This standalone
 * per-resource "since" fetch has no direct Tally API equivalent and is not
 * ported; use `pullSync()` instead.
 */

export async function createProduct(client: ApiClient, input: ProductInput): Promise<Product> {
  const { data } = await client.post<{ data: JsonApiResource<ProductAttrs> }>(
    "/products",
    toPayload(input),
  );
  return toProduct(data);
}

/** stock_quantity is intentionally not part of ProductInput — see AdjustStockAction / adjustStock(). */
export async function updateProduct(
  client: ApiClient,
  id: string,
  patch: Partial<ProductInput>,
): Promise<Product> {
  const { data } = await client.patch<{ data: JsonApiResource<ProductAttrs> }>(
    `/products/${id}`,
    toPayload(patch),
  );
  return toProduct(data);
}

export async function setProductActive(client: ApiClient, id: string, isActive: boolean): Promise<void> {
  await updateProduct(client, id, { isActive });
}

export type AdjustStockReason = "restock" | "adjustment" | "oversell_correction";

export async function adjustStock(
  client: ApiClient,
  id: string,
  input: { changeQuantity: number; reason: AdjustStockReason; note?: string | null },
): Promise<Product> {
  const { data } = await client.post<{ data: JsonApiResource<ProductAttrs> }>(
    `/products/${id}/adjust-stock`,
    { change_quantity: input.changeQuantity, reason: input.reason, note: input.note ?? null },
    { idempotent: true },
  );
  return toProduct(data);
}

/**
 * GAP: no bulk upsert-by-SKU endpoint on the Tally API. The old CSV import
 * flow (`upsertProductsBySku`) relied on a single Postgres `upsert(...,
 * { onConflict: "sku" })` call. Doing this as N sequential create/update
 * calls changes the error contract (partial-failure semantics, no single
 * transaction) — flagging rather than faking it. CSV import needs either a
 * bulk endpoint on pos-inventory-laravel or an explicit decision to accept
 * per-row calls with its own progress/error UI.
 */
export function upsertProductsBySku(): never {
  throw new Error(
    "upsertProductsBySku has no Tally API equivalent yet — CSV bulk import needs a backend decision before porting this call site.",
  );
}

export async function listBelowReorder(client: ApiClient): Promise<Product[]> {
  const { data } = await client.get<{ data: JsonApiResource<ProductAttrs>[] }>(
    "/inventory/below-reorder",
  );
  return data.map(toProduct);
}

export interface ProductLabel {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  categoryId: string | null;
}

/**
 * `GET /products/labels` (`ProductLabelsController`) — one lean, unpaginated
 * query for every active SKU'd product, built for the QR/barcode label
 * sheet. Replaced walking IndexProductsController's full paginated
 * ProductResource across every page, which fetched every column on every
 * product and tripped the rate limiter on a real catalogue.
 */
export async function listProductLabels(client: ApiClient): Promise<ProductLabel[]> {
  const { data } = await client.get<{
    data: { id: string; sku: string; name: string; category: string | null; category_id: string | null }[];
  }>("/products/labels");

  return data.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    categoryId: row.category_id,
  }));
}
