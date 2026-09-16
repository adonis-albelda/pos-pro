import type { ApiClient } from "@double-a/api-client";
import {
  createCategory,
  createFullProduct,
  listCategories,
  type CreateFullProductInput,
  type ReadyCatalogProduct,
} from "@double-a/api-client/queries";

const LABEL_ATTRIBUTE = "Label";

function variantLabels(product: ReadyCatalogProduct): string[] {
  const labels = product.variants.map((v) => v.trim()).filter(Boolean);
  return labels.length > 0 ? labels : ["Standard"];
}

/** Find category by name (case-insensitive) or create it. */
export async function ensureCategoryId(
  client: ApiClient,
  categoryName: string,
): Promise<string> {
  const name = categoryName.trim();
  const existing = await listCategories(client, { includeInactive: true });
  const match = existing.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
  if (match) return match.id;
  const created = await createCategory(client, {
    name,
    parentId: null,
    isActive: true,
    markupPercent: 0,
    markupApplied: false,
  });
  return created.id;
}

/** Build create-full payload: Label option + one variant per label, prices 0. */
export function buildReadyCatalogProductInput(
  product: ReadyCatalogProduct,
  categoryId: string,
): CreateFullProductInput {
  const labels = variantLabels(product);
  const brandName = product.brand?.trim();
  return {
    productKind: "with_variants",
    product: {
      name: product.name.trim(),
      categoryId,
      price: 0,
      costPrice: 0,
      unit: "pc",
      isSellable: true,
      isPurchasable: true,
      isTrackInventory: true,
    },
    // A `{ name }` ref (vs `{ id }`) makes CreateFullProductAction find-or-
    // create the Brand transactionally alongside the product — same
    // mechanism the product form's inline "create brand" already uses.
    ...(brandName ? { brand: { name: brandName } } : {}),
    attributes: [
      {
        name: LABEL_ATTRIBUTE,
        values: labels.map((name) => ({ name })),
      },
    ],
    variants: labels.map(() => ({
      price: 0,
      costPrice: 0,
    })),
  };
}

export interface ImportReadyCatalogResult {
  created: number;
  failed: { name: string; message: string }[];
}

/**
 * Import selected ready-catalog products into the shop catalogue.
 * Category is find-or-create once; each product becomes create-full with Label variants.
 */
export async function importReadyCatalogProducts(
  client: ApiClient,
  categoryName: string,
  products: ReadyCatalogProduct[],
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<ImportReadyCatalogResult> {
  if (products.length === 0) {
    return { created: 0, failed: [] };
  }

  const categoryId = await ensureCategoryId(client, categoryName);
  const failed: ImportReadyCatalogResult["failed"] = [];
  let created = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i]!;
    onProgress?.(i, products.length, product.name);
    try {
      await createFullProduct(client, buildReadyCatalogProductInput(product, categoryId));
      created += 1;
    } catch (error) {
      failed.push({
        name: product.name,
        message: error instanceof Error ? error.message : "Import failed",
      });
    }
  }

  onProgress?.(products.length, products.length, "");
  return { created, failed };
}
