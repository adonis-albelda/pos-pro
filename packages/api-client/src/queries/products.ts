import type { Product } from "@double-a/shared-types";
import { ApiError, type ApiClient, type JsonApiPage, type JsonApiResource } from "../http";
import { appendMultipartField, appendMultipartFile, type MultipartFile } from "../multipart";
import { type ProductAttrs, toProduct } from "../mappers";

export interface ProductInput {
  name: string;
  description?: string | null;
  sku?: string | null;
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
  isBundle?: boolean;
  brandId?: string | null;
  productType?: string;
  notes?: string | null;
  isSellable?: boolean;
  isPurchasable?: boolean;
  isTrackInventory?: boolean;
  /** Create-only, transient — see ProductObserver::withoutDefaultVariant() (Laravel). */
  skipDefaultVariant?: boolean;
}

function toPayload(input: Partial<ProductInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description;
  if (input.sku !== undefined) payload.sku = input.sku;
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
  if (input.isBundle !== undefined) payload.is_bundle = input.isBundle;
  if (input.brandId !== undefined) payload.brand_id = input.brandId;
  if (input.productType !== undefined) payload.product_type = input.productType;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.isSellable !== undefined) payload.is_sellable = input.isSellable;
  if (input.isPurchasable !== undefined) payload.is_purchasable = input.isPurchasable;
  if (input.isTrackInventory !== undefined) payload.is_track_inventory = input.isTrackInventory;
  if (input.skipDefaultVariant !== undefined) payload.skip_default_variant = input.skipDefaultVariant;
  return payload;
}

export type ProductStockState = "attention" | "low" | "out" | "oversold" | "healthy" | "hidden";
export type ProductSort =
  | "stock-asc"
  | "stock-desc"
  | "short-desc"
  | "value-desc"
  | "price-asc"
  | "price-desc";

export interface ListProductsPageOptions {
  q?: string;
  page?: number;
  pageSize?: number;
  includeInactive?: boolean;
  categoryId?: string;
  /** Only products linked to this supplier (supplier_products pivot). */
  supplierId?: string;
  /** Scope stock_quantity to one location; omit for company-wide total. */
  locationId?: string;
  /** Server-computed from stock_quantity/reorder_point/is_active — ignores `includeInactive` when given (see IndexProductsController). */
  state?: ProductStockState;
  sort?: ProductSort;
  /** "only" lists soft-deleted products instead of live ones — see restoreProduct(). */
  trashed?: "only";
}

export async function listProductsPage(
  client: ApiClient,
  options: ListProductsPageOptions = {},
): Promise<{ products: Product[]; total: number; lastPage: number }> {
  const page = await client.get<JsonApiPage<ProductAttrs>>("/products", {
    search: options.q,
    category_id: options.categoryId,
    supplier_id: options.supplierId,
    location_id: options.locationId,
    is_active: options.state || options.includeInactive ? undefined : true,
    state: options.state,
    sort: options.sort,
    trashed: options.trashed,
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
  options: { includeInactive?: boolean; locationId?: string } = {},
): Promise<Product[]> {
  const products: Product[] = [];
  let page = 1;
  for (;;) {
    const result = await listProductsPage(client, {
      page,
      pageSize: 200,
      includeInactive: options.includeInactive,
      locationId: options.locationId,
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
  image: MultipartFile,
  options: { locationId?: string | null; applyStock?: boolean } = {},
): Promise<ExtractedProductLine[]> {
  const formData = new FormData();
  await appendMultipartFile(formData, "image", image);
  if (options.locationId) {
    appendMultipartField(formData, "location_id", options.locationId);
  }
  // Default true server-side (restock-on-match) — the sale-cart caller sets
  // this false so reading a customer's order photo never restocks a shelf.
  if (options.applyStock === false) {
    appendMultipartField(formData, "apply_stock", "0");
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

export interface FixImportRowsInput {
  fieldGuide: string;
  rejected: Array<{
    line: number;
    errors: string[];
    sourceCells: Record<string, string>;
    mapped: Partial<Record<string, string>>;
  }>;
  samples: Array<{
    line: number;
    sourceCells: Record<string, string>;
    mapped: Partial<Record<string, string>>;
  }>;
}

export interface ImportRowFix {
  line: number;
  fields: Record<string, string>;
  reason?: string;
}

/**
 * AI fix-suggestions for CSV import rows the wizard turned away — runs
 * server-side via Laravel AI (App\Actions\FixImportRowsAction), gated by the
 * same product_photo_ai feature flag and weekly quota as photo extraction.
 * Stateless: nothing about the rejected rows is persisted, this just returns
 * whatever fixes the AI could confidently suggest.
 */
export async function fixImportRows(
  client: ApiClient,
  input: FixImportRowsInput,
): Promise<{ fixes: ImportRowFix[]; attempted: number }> {
  const { data } = await client.post<{
    data: {
      fixes: Array<{ line: number; fields: Record<string, string>; reason: string | null }>;
      attempted: number;
    };
  }>("/products/import/fix-rows", {
    field_guide: input.fieldGuide,
    rejected: input.rejected.map((row) => ({
      line: row.line,
      errors: row.errors,
      source_cells: row.sourceCells,
      mapped: row.mapped,
    })),
    samples: input.samples.map((row) => ({
      line: row.line,
      source_cells: row.sourceCells,
      mapped: row.mapped,
    })),
  });

  return {
    fixes: data.fixes.map((fix) => ({
      line: fix.line,
      fields: fix.fields,
      reason: fix.reason ?? undefined,
    })),
    attempted: data.attempted,
  };
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

export interface VectorSearchResult {
  id: string;
  score: number;
}

/**
 * `GET /products/vector-search` — meaning-based match (Laravel AI / OpenAI
 * embeddings), ranked by cosine similarity server-side. Callers only need
 * `id`/`score`: the mobile POS re-reads the actual product rows from its own
 * local SQLite copy, same as every other lookup there (CLAUDE.md — Supabase-
 * era wording aside, still "device DB stays the read source after a pull").
 */
export async function vectorSearchProducts(
  client: ApiClient,
  q: string,
  options: { limit?: number } = {},
): Promise<VectorSearchResult[]> {
  const needle = q.trim();
  if (!needle) return [];

  const { data } = await client.get<{ data: { id: string; score: number }[] }>(
    "/products/vector-search",
    { q: needle, limit: options.limit ?? 20 },
  );

  return data.map((row) => ({ id: row.id, score: row.score }));
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

export interface VariantSignal {
  detected: boolean;
  matchedText?: string;
  patternType?: string;
  suggestedAttributeName?: string;
}

interface VariantSignalAttrs {
  detected: boolean;
  matched_text?: string;
  pattern_type?: string;
  suggested_attribute_name?: string;
}

function toVariantSignal(attrs: VariantSignalAttrs): VariantSignal {
  return {
    detected: attrs.detected,
    matchedText: attrs.matched_text,
    patternType: attrs.pattern_type,
    suggestedAttributeName: attrs.suggested_attribute_name,
  };
}

/**
 * The create/update response carries a `meta.variant_signal` suggestion
 * alongside the saved product — computed from the same name in the same
 * request, not a separate round trip a caller has to remember to make and
 * that could otherwise race a post-save redirect.
 */
export async function createProduct(
  client: ApiClient,
  input: ProductInput,
): Promise<{ product: Product; variantSignal: VariantSignal }> {
  const { data, meta } = await client.post<{
    data: JsonApiResource<ProductAttrs>;
    meta?: { variant_signal?: VariantSignalAttrs };
  }>("/products", toPayload(input));
  return {
    product: toProduct(data),
    variantSignal: toVariantSignal(meta?.variant_signal ?? { detected: false }),
  };
}

interface CreateFullProductVocabRef {
  id?: string;
  name?: string;
}

interface CreateFullProductSupplierLink {
  supplierId: string;
  supplierSku?: string | null;
  supplierPrice?: number | null;
}

/**
 * Everything the create-product wizard collects, across every step, sent
 * as one payload — see CreateFullProductAction (Laravel). Nothing above
 * this call ever touches the database; a `{ id }` ref reuses an existing
 * Brand/Tag/CompanyAttribute(Value), a `{ name }` ref creates one
 * transactionally alongside the product itself.
 */
export interface CreateFullProductInput {
  productKind: "single" | "with_variants";
  product: {
    name: string;
    description?: string | null;
    sku?: string | null;
    price?: number;
    costPrice?: number;
    categoryId?: string | null;
    unit?: string;
    barcode?: string | null;
    reorderPoint?: number;
    replenishQuantity?: number;
    bulkPrice?: number | null;
    bulkMinQuantity?: number | null;
    allowDecimal?: boolean;
    isBundle?: boolean;
    productType?: string;
    notes?: string | null;
    isSellable?: boolean;
    isPurchasable?: boolean;
    isTrackInventory?: boolean;
    /** Single-product only — hide whole SKU from terminals when false. */
    isActive?: boolean;
  };
  brand?: CreateFullProductVocabRef | null;
  tags?: CreateFullProductVocabRef[];
  openingStock?: { locationId: string; quantity: number }[];
  openingStockNote?: string | null;
  /** Single-product only — attached to the new default variant. */
  suppliers?: CreateFullProductSupplierLink[];
  /** With-variants only. */
  attributes?: {
    id?: string;
    name?: string;
    values: CreateFullProductVocabRef[];
  }[];
  /**
   * With-variants only — outer index must match the cartesian-product
   * order `attributes` produces (attribute order, then value order,
   * exactly as given) so combo N here lines up with generated variant N.
   */
  variantSuppliers?: CreateFullProductSupplierLink[][];
  /**
   * With-variants only — per-generated-variant price/barcode/reorder/
   * replenish/opening stock, same index convention as variantSuppliers.
   * SKU and cost price are always server-assigned/resolved.
   */
  variants?: {
    price?: number | null;
    costPrice?: number | null;
    barcode?: string | null;
    reorderPoint?: number;
    replenishQuantity?: number;
    bulkPrice?: number | null;
    bulkMinQuantity?: number | null;
    /** Defaults true when omitted — hide from terminals when false. */
    isActive?: boolean;
    /** Kit flag on this generated SKU (product_variants.is_bundle). */
    isBundle?: boolean;
    openingStock?: { locationId: string; quantity: number }[];
  }[];
}

function toFullProductPayload(input: CreateFullProductInput): Record<string, unknown> {
  const toSupplierLink = (link: CreateFullProductSupplierLink) => ({
    supplier_id: link.supplierId,
    supplier_sku: link.supplierSku ?? null,
    supplier_price: link.supplierPrice ?? null,
  });

  return {
    product_kind: input.productKind,
    product: {
      name: input.product.name,
      description: input.product.description ?? null,
      sku: input.product.sku ?? null,
      price: input.product.price,
      cost_price: input.product.costPrice,
      category_id: input.product.categoryId ?? null,
      unit: input.product.unit,
      barcode: input.product.barcode ?? null,
      reorder_point: input.product.reorderPoint,
      replenish_quantity: input.product.replenishQuantity,
      bulk_price: input.product.bulkPrice ?? null,
      bulk_min_quantity: input.product.bulkMinQuantity ?? null,
      allow_decimal: input.product.allowDecimal,
      is_bundle: input.product.isBundle,
      product_type: input.product.productType,
      notes: input.product.notes ?? null,
      is_sellable: input.product.isSellable,
      is_purchasable: input.product.isPurchasable,
      is_track_inventory: input.product.isTrackInventory,
      is_active: input.product.isActive ?? true,
    },
    brand: input.brand ? { id: input.brand.id, name: input.brand.name } : null,
    tags: (input.tags ?? []).map((tag) => ({ id: tag.id, name: tag.name })),
    opening_stock: (input.openingStock ?? []).map((row) => ({
      location_id: row.locationId,
      quantity: row.quantity,
    })),
    opening_stock_note: input.openingStockNote ?? null,
    suppliers: (input.suppliers ?? []).map(toSupplierLink),
    attributes: (input.attributes ?? []).map((attribute) => ({
      id: attribute.id,
      name: attribute.name,
      values: attribute.values.map((value) => ({ id: value.id, name: value.name })),
    })),
    variant_suppliers: (input.variantSuppliers ?? []).map((links) => links.map(toSupplierLink)),
    variants: (input.variants ?? []).map((variant) => ({
      price: variant.price ?? null,
      cost_price: variant.costPrice ?? null,
      barcode: variant.barcode ?? null,
      reorder_point: variant.reorderPoint,
      replenish_quantity: variant.replenishQuantity,
      bulk_price: variant.bulkPrice ?? null,
      bulk_min_quantity: variant.bulkMinQuantity ?? null,
      is_active: variant.isActive ?? true,
      is_bundle: variant.isBundle ?? false,
      opening_stock: (variant.openingStock ?? []).map((row) => ({
        location_id: row.locationId,
        quantity: row.quantity,
      })),
    })),
  };
}

/**
 * The whole create-product wizard in one call — product details, brand/
 * tags, opening stock, gallery photos, suppliers, and (with-variants)
 * attributes/values/generated variants, committed atomically server-side.
 * See CreateFullProductAction (Laravel).
 *
 * Multipart:
 * - `photos[]` — product-level gallery (single-product default variant, or
 *   with-variants product cover when provided).
 * - `variant_photos[N][]` — with-variants only; N matches `variants[]`
 *   index in the JSON payload (same cartesian order as variant_suppliers).
 */
export async function createFullProduct(
  client: ApiClient,
  input: CreateFullProductInput,
  photos: MultipartFile[] = [],
  variantPhotos: MultipartFile[][] = [],
): Promise<{ product: Product; variantSignal: VariantSignal }> {
  const formData = new FormData();
  appendMultipartField(formData, "payload", JSON.stringify(toFullProductPayload(input)));
  for (const photo of photos) {
    await appendMultipartFile(formData, "photos[]", photo);
  }
  for (let index = 0; index < variantPhotos.length; index++) {
    for (const photo of variantPhotos[index] ?? []) {
      await appendMultipartFile(formData, `variant_photos[${index}][]`, photo);
    }
  }

  const { data, meta } = await client.postMultipart<{
    data: JsonApiResource<ProductAttrs>;
    meta?: { variant_signal?: VariantSignalAttrs };
  }>("/products/create-full", formData, { idempotent: true });
  return {
    product: toProduct(data),
    variantSignal: toVariantSignal(meta?.variant_signal ?? { detected: false }),
  };
}

/** stock_quantity is intentionally not part of ProductInput — see AdjustStockAction / adjustStock(). */
export async function updateProduct(
  client: ApiClient,
  id: string,
  patch: Partial<ProductInput>,
): Promise<{ product: Product; variantSignal: VariantSignal }> {
  const { data, meta } = await client.patch<{
    data: JsonApiResource<ProductAttrs>;
    meta?: { variant_signal?: VariantSignalAttrs };
  }>(`/products/${id}`, toPayload(patch));
  return {
    product: toProduct(data),
    variantSignal: toVariantSignal(meta?.variant_signal ?? { detected: false }),
  };
}

/** Claims and returns the next sequential SKU (SKU-000000001, ...) — for real, not a preview. See NextSkuController. */
export async function getNextSku(client: ApiClient): Promise<string> {
  const { data } = await client.get<{ data: { sku: string } }>("/products/next-sku");
  return data.sku;
}

export interface SkuConflict {
  type: "product" | "variant";
  id: string;
  name: string;
}

/** Read-only, no side effects — the realtime duplicate check while typing. */
export async function checkSku(
  client: ApiClient,
  value: string,
  options: { excludeProductId?: string; excludeVariantId?: string } = {},
): Promise<{ available: boolean; conflict: SkuConflict | null }> {
  const { data } = await client.get<{ data: { available: boolean; conflict: SkuConflict | null } }>(
    "/skus/check-sku",
    {
      value,
      exclude_product_id: options.excludeProductId,
      exclude_variant_id: options.excludeVariantId,
    },
  );
  return data;
}

/**
 * Scoped to one supplier — two different suppliers can share a code without
 * conflicting. `excludePivotId` is the product_variant_suppliers row being
 * edited, if any (a link's own id, not a product/variant id).
 */
export async function checkSupplierSku(
  client: ApiClient,
  supplierId: string,
  value: string,
  options: { excludePivotId?: string } = {},
): Promise<{ available: boolean; conflict: SkuConflict | null }> {
  const { data } = await client.get<{ data: { available: boolean; conflict: SkuConflict | null } }>(
    "/skus/check-supplier-sku",
    {
      supplier_id: supplierId,
      value,
      exclude_pivot_id: options.excludePivotId,
    },
  );
  return data;
}

/** "No, keep as regular text" — this product never shows the suggestion again. */
export async function dismissVariantSignal(client: ApiClient, id: string): Promise<void> {
  await client.post(`/products/${id}/dismiss-variant-signal`);
}

export async function setProductActive(client: ApiClient, id: string, isActive: boolean): Promise<void> {
  await updateProduct(client, id, { isActive });
}

/** Copies every field except sku/barcode (must stay unique) and suffixes the name " Clone". Supplier links are never copied either — give the clone its own. */
export async function cloneProduct(client: ApiClient, id: string): Promise<Product> {
  const { data } = await client.post<{ data: JsonApiResource<ProductAttrs> }>(`/products/${id}/clone`);
  return toProduct(data);
}

/**
 * Catalog cleanup: reparent this product's sellable variant under a canonical
 * parent (as an attributed variant), or fold suppliers+stock into an existing
 * target variant. Soft-deletes the emptied source product. See MoveProductIntoAction.
 */
export async function moveProductInto(
  client: ApiClient,
  sourceProductId: string,
  input: {
    targetProductId: string;
    variantId?: string | null;
    attributeValueIds?: string[];
    mergeIntoVariantId?: string | null;
    /** When merging: add source stock onto target (default true). */
    mergeStock?: boolean;
    /** Shelf price to set on the resulting variant. */
    price?: number | null;
  },
): Promise<{ id: string; productId: string }> {
  const { data } = await client.post<{
    data: JsonApiResource<{ product_id?: string }>;
  }>(`/products/${sourceProductId}/move-into`, {
    target_product_id: input.targetProductId,
    variant_id: input.variantId ?? undefined,
    attribute_value_ids: input.attributeValueIds,
    merge_into_variant_id: input.mergeIntoVariantId ?? undefined,
    merge_stock: input.mergeStock,
    price: input.price ?? undefined,
  });
  return {
    id: data.id,
    productId: String(data.attributes.product_id ?? input.targetProductId),
  };
}

/** Soft delete — stock and sales history stay, terminals stop seeing it on their next sync. */
export async function deleteProduct(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/products/${id}`);
}

/** Undoes deleteProduct(). */
export async function restoreProduct(client: ApiClient, id: string): Promise<Product> {
  const { data } = await client.post<{ data: JsonApiResource<ProductAttrs> }>(`/products/${id}/restore`);
  return toProduct(data);
}

/** Server resizes to a mobile-friendly size and re-encodes as WebP — send the original file as-is. */
export async function uploadProductPhoto(client: ApiClient, id: string, photo: MultipartFile): Promise<Product> {
  const formData = new FormData();
  await appendMultipartFile(formData, "photo", photo);
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

/** Replace-all for a bundle's recipe — mirrors setSupplierProducts. */
export async function setBundleItems(
  client: ApiClient,
  id: string,
  items: { productId: string; quantity: number }[],
): Promise<Product> {
  const { data } = await client.put<{ data: JsonApiResource<ProductAttrs> }>(
    `/products/${id}/bundle-items`,
    { items: items.map((item) => ({ product_id: item.productId, quantity: item.quantity })) },
  );
  return toProduct(data);
}

/** Converts component stock into bundle stock at one location. */
export async function assembleBundle(
  client: ApiClient,
  id: string,
  input: { quantity: number; locationId: string; note?: string | null },
): Promise<Product> {
  const { data } = await client.post<{ data: JsonApiResource<ProductAttrs> }>(
    `/products/${id}/assemble`,
    { quantity: input.quantity, location_id: input.locationId, note: input.note },
  );
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
    /** Defaults server-side to the product's default variant when omitted. */
    variantId?: string | null;
    /** Which supplier this stock came from — mainly meaningful for a restock. */
    supplierId?: string | null;
  },
): Promise<Product> {
  const { data } = await client.post<{ data: JsonApiResource<ProductAttrs> }>(
    `/products/${id}/adjust-stock`,
    {
      change_quantity: input.changeQuantity,
      reason: input.reason,
      note: input.note ?? null,
      location_id: input.locationId ?? undefined,
      variant_id: input.variantId ?? undefined,
      supplier_id: input.supplierId ?? undefined,
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

export type ProductImportRollbackStatus = "processing" | "completed" | "failed";

export interface ProductImportRollbackSkip {
  product_id: string;
  sku: string | null;
  reason: string;
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
  rollbackStatus: ProductImportRollbackStatus | null;
  rolledBackAt: string | null;
  productsRestored: number;
  productsRemoved: number;
  stockReversed: number;
  rollbackSkips: ProductImportRollbackSkip[];
}

/** Lean history-list row — no rows/failures payload, see getProductImportStatus for the full detail shape. */
export interface ProductImportSummary {
  id: string;
  status: ProductImportStatus["status"];
  rollbackStatus: ProductImportRollbackStatus | null;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  stockAdjustedCount: number;
  productsRestored: number;
  productsRemoved: number;
  stockReversed: number;
  rolledBackAt: string | null;
  createdBy: string | null;
  createdAt: string | null;
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
      rollback_status: ProductImportRollbackStatus | null;
      rolled_back_at: string | null;
      products_restored: number;
      products_removed: number;
      stock_reversed: number;
      rollback_skips: ProductImportRollbackSkip[];
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
    rollbackStatus: data.rollback_status,
    rolledBackAt: data.rolled_back_at,
    productsRestored: data.products_restored,
    productsRemoved: data.products_removed,
    stockReversed: data.stock_reversed,
    rollbackSkips: data.rollback_skips ?? [],
  };
}

/** Runs in the background — poll getProductImportStatus for progress, same as a fresh import. */
export async function rollbackProductImport(
  client: ApiClient,
  importId: string,
): Promise<{ importId: string; rollbackStatus: string }> {
  const { data } = await client.post<{
    data: { import_id: string; rollback_status: string };
  }>(`/products/import/${importId}/rollback`);

  return { importId: data.import_id, rollbackStatus: data.rollback_status };
}

export async function listProductImports(
  client: ApiClient,
  options: { page?: number; pageSize?: number } = {},
): Promise<{ imports: ProductImportSummary[]; total: number; lastPage: number }> {
  const page = await client.get<
    JsonApiPage<{
      status: ProductImportStatus["status"];
      rollback_status: ProductImportRollbackStatus | null;
      total_rows: number;
      created_count: number;
      updated_count: number;
      stock_adjusted_count: number;
      products_restored_count: number;
      products_removed_count: number;
      stock_reversed_count: number;
      rolled_back_at: string | null;
      created_by: string | null;
      created_at: string | null;
    }>
  >("/products/import", {
    page: options.page ?? 1,
    per_page: options.pageSize ?? 25,
  });

  return {
    imports: page.data.map((row) => ({
      id: row.id,
      status: row.attributes.status,
      rollbackStatus: row.attributes.rollback_status,
      totalRows: row.attributes.total_rows,
      createdCount: row.attributes.created_count,
      updatedCount: row.attributes.updated_count,
      stockAdjustedCount: row.attributes.stock_adjusted_count,
      productsRestored: row.attributes.products_restored_count,
      productsRemoved: row.attributes.products_removed_count,
      stockReversed: row.attributes.stock_reversed_count,
      rolledBackAt: row.attributes.rolled_back_at,
      createdBy: row.attributes.created_by,
      createdAt: row.attributes.created_at,
    })),
    total: page.meta?.total ?? page.data.length,
    lastPage: page.meta?.last_page ?? 1,
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
