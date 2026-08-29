import type { Product } from "@double-a/shared-types";
import { ApiError, type ApiClient, type JsonApiPage, type JsonApiResource } from "../http";
import { type ProductAttrs, toProduct } from "../mappers";

export interface ProductInput {
  name: string;
  description?: string | null;
  sku?: string | null;
  supplierSku?: string | null;
  price: number;
  costPrice: number;
  categoryId?: string | null;
  unit: string;
  barcode?: string | null;
  reorderPoint?: number;
  replenishQuantity?: number;
  bulkPrice?: number | null;
  bulkMinQuantity?: number | null;
  allowDecimal?: boolean;
  isActive?: boolean;
}

function toPayload(input: Partial<ProductInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description;
  if (input.sku !== undefined) payload.sku = input.sku;
  if (input.supplierSku !== undefined) payload.supplier_sku = input.supplierSku;
  if (input.price !== undefined) payload.price = input.price;
  if (input.costPrice !== undefined) payload.cost_price = input.costPrice;
  if (input.categoryId !== undefined) payload.category_id = input.categoryId;
  if (input.unit !== undefined) payload.unit = input.unit;
  if (input.barcode !== undefined) payload.barcode = input.barcode;
  if (input.reorderPoint !== undefined) payload.reorder_point = input.reorderPoint;
  if (input.replenishQuantity !== undefined) payload.replenish_quantity = input.replenishQuantity;
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
  /** Scope stock_quantity to one location; omit for company-wide total. */
  locationId?: string;
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
    location_id: options.locationId,
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
  total: number;
  tracked: number;
  stockCost: number;
  needsReordering: number;
  lowStock: number;
  outOfStock: number;
  oversold: number;
  hidden: number;
}

/**
 * `GET /products/stats` (`ProductStatsController`) — one aggregate query for
 * the Inventory page's header stat cards, instead of walking the whole
 * catalogue into the browser just to add four numbers up.
 */
export async function getProductStats(
  client: ApiClient,
  options: { locationId?: string } = {},
): Promise<ProductStats> {
  const { data } = await client.get<{
    data: {
      total: number;
      tracked: number;
      stock_cost: number;
      needs_reordering: number;
      low_stock: number;
      out_of_stock: number;
      oversold: number;
      hidden: number;
    };
  }>("/products/stats", {
    location_id: options.locationId,
  });

  return {
    total: data.total,
    tracked: data.tracked,
    stockCost: Number(data.stock_cost),
    needsReordering: data.needs_reordering,
    lowStock: data.low_stock,
    outOfStock: data.out_of_stock,
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
  description: string | null;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  costPrice: number | null;
  quantity: number | null;
  unit: string;
  existingProductId: string | null;
  stockApplied: boolean;
  matchedBy: "internal" | "supplier" | null;
}

interface ExtractedProductLineAttrs {
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  cost_price: number | null;
  quantity: number | null;
  unit: string;
  existing_product_id: string | null;
  stock_applied: boolean;
  matched_by: "internal" | "supplier" | null;
}

/** Vision extraction runs server-side (Laravel AI / OpenAI) — see apps/admin from-photo feature. */
export async function extractProductsFromPhoto(
  client: ApiClient,
  image: File,
  options: { locationId?: string | null } = {},
): Promise<ExtractedProductLine[]> {
  const formData = new FormData();
  formData.set("image", image);
  if (options.locationId) {
    formData.set("location_id", options.locationId);
  }

  const result = await client.postMultipart<{ data: ExtractedProductLineAttrs[] }>(
    "/products/extract-from-photo",
    formData,
  );

  return result.data.map((line) => ({
    name: line.name,
    description: line.description,
    sku: line.sku,
    barcode: line.barcode,
    price: line.price,
    costPrice: line.cost_price,
    quantity: line.quantity,
    unit: line.unit,
    existingProductId: line.existing_product_id,
    stockApplied: line.stock_applied,
    matchedBy: line.matched_by,
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

/** Server resizes to a mobile-friendly size and re-encodes as WebP — send the original file as-is. */
export async function uploadProductPhoto(client: ApiClient, id: string, photo: File): Promise<Product> {
  const formData = new FormData();
  formData.set("photo", photo);
  const { data } = await client.postMultipart<{ data: JsonApiResource<ProductAttrs> }>(
    `/products/${id}/photo`,
    formData,
  );
  return toProduct(data);
}

export async function deleteProductPhoto(client: ApiClient, id: string): Promise<Product> {
  const { data } = await client.delete<{ data: JsonApiResource<ProductAttrs> }>(`/products/${id}/photo`);
  return toProduct(data);
}

export type AdjustStockReason = "restock" | "adjustment" | "oversell_correction";

export async function adjustStock(
  client: ApiClient,
  id: string,
  input: {
    changeQuantity: number;
    reason: AdjustStockReason;
    note?: string | null;
    locationId?: string | null;
  },
): Promise<Product> {
  const { data } = await client.post<{ data: JsonApiResource<ProductAttrs> }>(
    `/products/${id}/adjust-stock`,
    {
      change_quantity: input.changeQuantity,
      reason: input.reason,
      note: input.note ?? null,
      location_id: input.locationId ?? undefined,
    },
    { idempotent: true },
  );
  return toProduct(data);
}

export type ProductStockMode = "skip" | "set" | "add";

export interface ProductImportRowPayload {
  line: number;
  name: string;
  description?: string | null;
  sku: string;
  supplier_sku?: string | null;
  price: number;
  cost_price?: number;
  unit?: string;
  barcode?: string | null;
  reorder_point?: number;
  replenish_quantity?: number;
  bulk_price?: number | null;
  bulk_min_quantity?: number | null;
  allow_decimal?: boolean;
  is_active?: boolean;
  category_path?: string | null;
  supplier_name?: string | null;
  stock_quantity?: number | null;
}

export interface ProductImportStatus {
  importId: string;
  status: "queued" | "processing" | "completed" | "failed";
  total: number;
  processed: number;
  percent: number;
  created: number;
  updated: number;
  stockAdjusted: number;
  failures: { line: number; sku: string; error: string }[];
  errorMessage: string | null;
}

export async function startProductImport(
  client: ApiClient,
  input: {
    rows: ProductImportRowPayload[];
    stockMode: ProductStockMode;
    locationId?: string | null;
  },
): Promise<{ importId: string; total: number; status: string }> {
  const { data } = await client.post<{
    data: { import_id: string; total: number; status: string };
  }>("/products/import", {
    rows: input.rows.map((row) => ({
      line: row.line,
      name: row.name,
      description: row.description,
      sku: row.sku,
      supplier_sku: row.supplier_sku,
      price: row.price,
      cost_price: row.cost_price,
      unit: row.unit,
      barcode: row.barcode,
      reorder_point: row.reorder_point,
      replenish_quantity: row.replenish_quantity,
      bulk_price: row.bulk_price,
      bulk_min_quantity: row.bulk_min_quantity,
      allow_decimal: row.allow_decimal,
      is_active: row.is_active,
      category_path: row.category_path,
      supplier_name: row.supplier_name,
      stock_quantity: row.stock_quantity,
    })),
    stock_mode: input.stockMode,
    location_id: input.locationId ?? undefined,
  });

  return {
    importId: data.import_id,
    total: data.total,
    status: data.status,
  };
}

export async function getProductImportStatus(
  client: ApiClient,
  importId: string,
): Promise<ProductImportStatus> {
  const { data } = await client.get<{
    data: {
      import_id: string;
      status: ProductImportStatus["status"];
      total: number;
      processed: number;
      percent: number;
      created: number;
      updated: number;
      stock_adjusted: number;
      failures: { line: number; sku: string; error: string }[];
      error_message: string | null;
    };
  }>(`/products/import/${importId}`);

  return {
    importId: data.import_id,
    status: data.status,
    total: data.total,
    processed: data.processed,
    percent: data.percent,
    created: data.created,
    updated: data.updated,
    stockAdjusted: data.stock_adjusted,
    failures: data.failures ?? [],
    errorMessage: data.error_message,
  };
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
 * query for the QR/barcode label sheet's own picker list, paginated and
 * searchable server-side — not a walk of IndexProductsController's full
 * paginated ProductResource across every page (the original fix), and not
 * an unpaginated single-shot fetch of the whole catalogue either (what this
 * replaced next) — that was still one big JSON payload on a real shop.
 */
export async function listProductLabelsPage(
  client: ApiClient,
  options: { q?: string; categoryId?: string; page?: number; pageSize?: number } = {},
): Promise<{ labels: ProductLabel[]; total: number; lastPage: number }> {
  const { data, meta } = await client.get<{
    data: { id: string; sku: string; name: string; category: string | null; category_id: string | null }[];
    meta: { total: number; last_page: number };
  }>("/products/labels", {
    search: options.q,
    category_id: options.categoryId,
    page: options.page ?? 1,
    per_page: options.pageSize ?? 50,
  });

  return {
    labels: data.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      category: row.category,
      categoryId: row.category_id,
    })),
    total: meta.total,
    lastPage: meta.last_page,
  };
}
