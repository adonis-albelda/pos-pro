import {
  isProductUnit,
  type Product,
  type ProductUnit,
  type ProductWithEstimatedStock,
} from "@double-a/shared-types";
import { getDb } from "./index";

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  cost_price: number;
  stock_quantity: number;
  category: string | null;
  category_id: string | null;
  unit: string;
  allow_decimal: number;
  barcode: string | null;
  reorder_point: number;
  replenish_quantity: number;
  description: string | null;
  bulk_price: number | null;
  bulk_min_quantity: number | null;
  is_active: number;
  photo_url: string | null;
  updated_at: string | null;
  pending_quantity: number;
}

/** A device a version behind the office can hold a unit this build does not know. */
function toUnit(value: string): ProductUnit {
  return isProductUnit(value) ? value : "pc";
}

function toProductWithEstimate(row: ProductRow): ProductWithEstimatedStock {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    // Not stored locally — mobile POS never displays or matches on this, unlike admin.
    supplierSku: null,
    price: row.price,
    costPrice: row.cost_price,
    stockQuantity: row.stock_quantity,
    category: row.category,
    categoryId: row.category_id,
    unit: toUnit(row.unit),
    allowDecimal: row.allow_decimal === 1,
    barcode: row.barcode,
    reorderPoint: row.reorder_point,
    replenishQuantity: row.replenish_quantity ?? 0,
    description: row.description,
    bulkPrice: row.bulk_price,
    bulkMinQuantity: row.bulk_min_quantity,
    isActive: row.is_active === 1,
    photoUrl: row.photo_url,
    updatedAt: row.updated_at ?? "",
    pendingQuantity: row.pending_quantity,
    estimatedStock: row.stock_quantity - row.pending_quantity,
  };
}

/**
 * Estimated stock is computed here, at read time, never stored:
 *
 *   estimated = last synced stock - everything sold locally but not yet pushed
 *
 * It is a display estimate. The real number lives in Supabase and comes back on
 * the next pull.
 */
const SELECT_SQL = `
SELECT p.id,
       p.name,
       p.sku,
       p.price,
       p.cost_price,
       p.stock_quantity,
       p.category,
       p.category_id,
       p.unit,
       p.allow_decimal,
       p.barcode,
       p.reorder_point,
       p.replenish_quantity,
       p.description,
       p.bulk_price,
       p.bulk_min_quantity,
       p.is_active,
       p.photo_url,
       p.updated_at,
       COALESCE((
         SELECT SUM(si.quantity)
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id
            AND s.sync_status = 'pending'
            AND s.status = 'completed'
       ), 0) AS pending_quantity
  FROM products p
`;

const LIST_SQL = `${SELECT_SQL} WHERE p.is_active = 1 ORDER BY p.name`;

const BY_BARCODE_SQL = `${SELECT_SQL}
  WHERE p.is_active = 1 AND (p.barcode = ? OR p.sku = ?)
  LIMIT 1`;

/** First paint and each scroll batch on the sell grid. */
export const PRODUCT_PAGE_SIZE = 50;

export type ListLocalProductsPageArgs = {
  limit?: number;
  offset?: number;
  search?: string;
  /** Shelf filter. Ignored when `search` is non-empty — typing searches the whole catalogue. */
  categoryIds?: string[] | null;
};

function likeContains(term: string): string {
  return `%${term.replace(/[%_\\]/g, "")}%`;
}

function buildListQuery(args: ListLocalProductsPageArgs): {
  sql: string;
  params: (string | number)[];
} {
  const clauses = ["p.is_active = 1"];
  const params: (string | number)[] = [];
  const needle = args.search?.trim() ?? "";
  const categoryIds = needle ? null : (args.categoryIds ?? null);

  if (categoryIds && categoryIds.length > 0) {
    clauses.push(`p.category_id IN (${categoryIds.map(() => "?").join(", ")})`);
    params.push(...categoryIds);
  } else if (categoryIds && categoryIds.length === 0) {
    clauses.push("1 = 0");
  }

  let orderBy = "p.name";
  if (needle) {
    const like = likeContains(needle);
    clauses.push(
      `(p.name LIKE ? COLLATE NOCASE OR IFNULL(p.sku, '') LIKE ? COLLATE NOCASE OR IFNULL(p.barcode, '') LIKE ? COLLATE NOCASE)`,
    );
    params.push(like, like, like);
    orderBy = `CASE
      WHEN IFNULL(p.barcode, '') = ? COLLATE NOCASE THEN 0
      WHEN IFNULL(p.sku, '') = ? COLLATE NOCASE THEN 1
      ELSE 2
    END, p.name`;
    params.push(needle, needle);
  }

  let sql = `${SELECT_SQL} WHERE ${clauses.join(" AND ")} ORDER BY ${orderBy}`;
  if (args.limit != null) {
    sql += " LIMIT ? OFFSET ?";
    params.push(args.limit, args.offset ?? 0);
  }

  return { sql, params };
}

export async function listLocalProducts(): Promise<ProductWithEstimatedStock[]> {
  const rows = await getDb().getAllAsync<ProductRow>(LIST_SQL);
  return rows.map(toProductWithEstimate);
}

/** One window of the catalogue. Sell screen keeps only what the cashier has scrolled. */
export async function listLocalProductsPage(
  args: ListLocalProductsPageArgs = {},
): Promise<ProductWithEstimatedStock[]> {
  const { sql, params } = buildListQuery({
    ...args,
    limit: args.limit ?? PRODUCT_PAGE_SIZE,
    offset: args.offset ?? 0,
  });
  const rows = await getDb().getAllAsync<ProductRow>(sql, ...params);
  return rows.map(toProductWithEstimate);
}

export async function listLocalProductsByIds(
  productIds: string[],
): Promise<ProductWithEstimatedStock[]> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(", ");
  const rows = await getDb().getAllAsync<ProductRow>(
    `${SELECT_SQL} WHERE p.id IN (${placeholders})`,
    ...ids,
  );
  return rows.map(toProductWithEstimate);
}

/**
 * Exact barcode or SKU match, for a scanner (or a QR printed from the SKU).
 * Equality only — a partial match would put the wrong product in the cart.
 */
export async function findLocalProductByBarcode(
  code: string,
): Promise<ProductWithEstimatedStock | null> {
  const needle = code.trim();
  if (!needle) return null;

  const row = await getDb().getFirstAsync<ProductRow>(BY_BARCODE_SQL, needle, needle);
  return row ? toProductWithEstimate(row) : null;
}

/**
 * Name, SKU or barcode. A scanned code is an exact hit and jumps to the front,
 * ahead of anything that merely contains the typed text.
 */
export async function searchLocalProducts(
  term: string,
): Promise<ProductWithEstimatedStock[]> {
  const needle = term.trim();
  if (!needle) return listLocalProducts();

  const { sql, params } = buildListQuery({ search: needle });
  const rows = await getDb().getAllAsync<ProductRow>(sql, ...params);
  return rows.map(toProductWithEstimate);
}

/** Reports rows written so far against the total — drives the pull progress modal. */
export type WriteProgress = (done: number, total: number) => void;

async function insertOrReplaceProduct(
  db: ReturnType<typeof getDb>,
  product: Product,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO products
       (id, name, sku, price, cost_price, stock_quantity, category, category_id,
        unit, allow_decimal, barcode, reorder_point, replenish_quantity, description,
        bulk_price, bulk_min_quantity, is_active, photo_url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       sku = excluded.sku,
       price = excluded.price,
       cost_price = excluded.cost_price,
       stock_quantity = excluded.stock_quantity,
       category = excluded.category,
       category_id = excluded.category_id,
       unit = excluded.unit,
       allow_decimal = excluded.allow_decimal,
       barcode = excluded.barcode,
       reorder_point = excluded.reorder_point,
       replenish_quantity = excluded.replenish_quantity,
       description = excluded.description,
       bulk_price = excluded.bulk_price,
       bulk_min_quantity = excluded.bulk_min_quantity,
       is_active = excluded.is_active,
       photo_url = excluded.photo_url,
       updated_at = excluded.updated_at`,
    product.id,
    product.name,
    product.sku,
    product.price,
    product.costPrice,
    product.stockQuantity,
    product.category,
    product.categoryId,
    product.unit,
    product.allowDecimal ? 1 : 0,
    product.barcode,
    product.reorderPoint,
    product.replenishQuantity,
    product.description,
    product.bulkPrice,
    product.bulkMinQuantity,
    product.isActive ? 1 : 0,
    // expo-sqlite's native bind rejects `undefined` (only null/string/number/
    // Uint8Array are valid) — guard here too, not just at the API mapper.
    product.photoUrl ?? null,
    product.updatedAt,
  );
}

/** Overwrites local rows with what the pull returned. Supabase wins, always. */
export async function upsertProducts(
  products: Product[],
  onProgress?: WriteProgress,
): Promise<void> {
  if (products.length === 0) return;

  const db = getDb();
  await db.withTransactionAsync(async () => {
    for (const [index, product] of products.entries()) {
      await insertOrReplaceProduct(db, product);
      onProgress?.(index + 1, products.length);
    }
  });
}

/**
 * Wholesale replace, not an upsert — every local row is dropped and rebuilt
 * from this pull. Only reached from the Sync tab's explicit "Replace
 * everything" action; the regular Sync/Refresh path stays on the upsert
 * above (incremental, far cheaper on data/battery for a large catalogue).
 */
export async function replaceProducts(
  products: Product[],
  onProgress?: WriteProgress,
): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync("DELETE FROM products;");
    for (const [index, product] of products.entries()) {
      await insertOrReplaceProduct(db, product);
      onProgress?.(index + 1, products.length);
    }
  });
}

/**
 * The one live-broadcast write — patches just this product's stock, unlike
 * every other write in this file which is a bulk upsert/replace from a pull.
 * A no-op if the product hasn't been pulled to this device yet (WHERE finds
 * nothing to update).
 */
export async function updateProductStock(productId: string, quantity: number): Promise<void> {
  await getDb().runAsync(
    "UPDATE products SET stock_quantity = ? WHERE id = ?",
    quantity,
    productId,
  );
}

/**
 * How each product on a sale is sold by, for receipts and the sale detail
 * screen. Sale lines snapshot prices, not the unit — "m" or "bag" is a property
 * of the product and does not change under a completed sale.
 */
export async function getProductUnits(
  productIds: string[],
): Promise<Map<string, ProductUnit>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();

  const placeholders = ids.map(() => "?").join(", ");
  const rows = await getDb().getAllAsync<{ id: string; unit: string }>(
    `SELECT id, unit FROM products WHERE id IN (${placeholders})`,
    ...ids,
  );

  return new Map(rows.map((row) => [row.id, toUnit(row.unit)]));
}

export async function countLocalProducts(): Promise<number> {
  const row = await getDb().getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM products",
  );
  return row?.count ?? 0;
}

/** Matches the sell grid's own filter (is_active = 1) — what "All products" actually shows. */
export async function countActiveLocalProducts(): Promise<number> {
  const row = await getDb().getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM products WHERE is_active = 1",
  );
  return row?.count ?? 0;
}
