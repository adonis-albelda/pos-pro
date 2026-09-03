import type { ProductVariant, VariantAttributeValue } from "@double-a/shared-types";
import { getDb } from "./index";

interface ProductVariantRow {
  id: string;
  product_id: string;
  sku: string | null;
  price: number;
  cost_price: number;
  stock_quantity: number;
  is_default: number;
  is_active: number;
  attribute_values: string;
  updated_at: string | null;
}

function parseAttributeValues(json: string): VariantAttributeValue[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as VariantAttributeValue[]) : [];
  } catch {
    return [];
  }
}

function toProductVariant(row: ProductVariantRow): ProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.sku,
    // Not stored locally — same carve-out as Product.supplierSku (mobile
    // POS never displays or matches on it).
    supplierSku: null,
    barcode: null,
    price: row.price,
    costPrice: row.cost_price,
    stockQuantity: row.stock_quantity,
    isDefault: row.is_default === 1,
    isActive: row.is_active === 1,
    attributeValues: parseAttributeValues(row.attribute_values),
    updatedAt: row.updated_at ?? "",
  };
}

/** Human summary for a cart line / receipt — "L / Red", or "" for a variant with no attributes. */
export function variantAttributeLabel(variant: Pick<ProductVariant, "attributeValues">): string {
  return variant.attributeValues
    .map((value) => value.value)
    .filter((value): value is string => Boolean(value))
    .join(" / ");
}

/** Every variant of one product, default first — the picker's own listing. */
export async function listLocalVariantsForProduct(productId: string): Promise<ProductVariant[]> {
  const rows = await getDb().getAllAsync<ProductVariantRow>(
    `SELECT id, product_id, sku, price, cost_price, stock_quantity, is_default, is_active, attribute_values, updated_at
       FROM product_variants
      WHERE product_id = ? AND is_active = 1
      ORDER BY is_default DESC, sku`,
    productId,
  );
  return rows.map(toProductVariant);
}

/** The variant a cart line resolves to when the cashier never opens a picker. */
export async function getLocalDefaultVariant(productId: string): Promise<ProductVariant | null> {
  const row = await getDb().getFirstAsync<ProductVariantRow>(
    `SELECT id, product_id, sku, price, cost_price, stock_quantity, is_default, is_active, attribute_values, updated_at
       FROM product_variants
      WHERE product_id = ? AND is_default = 1
      LIMIT 1`,
    productId,
  );
  return row ? toProductVariant(row) : null;
}

export async function getLocalVariant(variantId: string): Promise<ProductVariant | null> {
  const row = await getDb().getFirstAsync<ProductVariantRow>(
    `SELECT id, product_id, sku, price, cost_price, stock_quantity, is_default, is_active, attribute_values, updated_at
       FROM product_variants
      WHERE id = ?`,
    variantId,
  );
  return row ? toProductVariant(row) : null;
}

/**
 * Same estimate as Product.estimatedStock (CLAUDE.md §2), scoped to one
 * variant instead of summed across every location_inventories row a
 * product has: last synced quantity minus everything sold locally but not
 * yet pushed for this specific variant.
 */
export async function getVariantPendingQuantity(variantId: string): Promise<number> {
  const row = await getDb().getFirstAsync<{ pending: number | null }>(
    `SELECT SUM(si.quantity) AS pending
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
      WHERE si.variant_id = ?
        AND s.sync_status = 'pending'
        AND s.status = 'completed'`,
    variantId,
  );
  return row?.pending ?? 0;
}

/** How many distinct products currently have more than one variant — cheap check for "does the picker ever fire." */
export async function countLocalVariants(): Promise<number> {
  const row = await getDb().getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM product_variants",
  );
  return row?.count ?? 0;
}

async function insertOrReplaceVariant(
  db: ReturnType<typeof getDb>,
  variant: ProductVariant,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO product_variants
       (id, product_id, sku, price, cost_price, stock_quantity, is_default, is_active, attribute_values, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       product_id = excluded.product_id,
       sku = excluded.sku,
       price = excluded.price,
       cost_price = excluded.cost_price,
       stock_quantity = excluded.stock_quantity,
       is_default = excluded.is_default,
       is_active = excluded.is_active,
       attribute_values = excluded.attribute_values,
       updated_at = excluded.updated_at`,
    variant.id,
    variant.productId,
    variant.sku,
    variant.price,
    variant.costPrice,
    variant.stockQuantity,
    variant.isDefault ? 1 : 0,
    variant.isActive ? 1 : 0,
    JSON.stringify(variant.attributeValues),
    variant.updatedAt,
  );
}

/** Overwrites local rows with what the pull returned — same upsert-by-id shape as products. */
export async function upsertVariants(variants: ProductVariant[]): Promise<void> {
  if (variants.length === 0) return;

  const db = getDb();
  await db.withTransactionAsync(async () => {
    for (const variant of variants) {
      await insertOrReplaceVariant(db, variant);
    }
  });
}

/** "Replace everything" path — mirrors replaceProducts. */
export async function replaceVariants(variants: ProductVariant[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync("DELETE FROM product_variants;");
    for (const variant of variants) {
      await insertOrReplaceVariant(db, variant);
    }
  });
}

/**
 * The one live-broadcast write — patches just this variant's stock, mirroring
 * updateProductStock. A no-op if the variant hasn't been pulled to this
 * device yet.
 */
export async function updateVariantStock(variantId: string, quantity: number): Promise<void> {
  await getDb().runAsync(
    "UPDATE product_variants SET stock_quantity = ? WHERE id = ?",
    quantity,
    variantId,
  );
}
