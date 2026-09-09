"use server";

import { revalidatePath } from "next/cache";
import { validateProductInput } from "@double-a/shared-types";
import { updateProduct } from "@double-a/api-client/queries";
import { ApiError } from "@double-a/api-client";
import type { FormState } from "@/lib/form-state";
import { getAuthedClient } from "@/lib/api/session";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** An empty box means "not set", never zero. */
function optionalNumber(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  return raw === "" ? null : Number(raw);
}

function readProductForm(formData: FormData) {
  return {
    name: text(formData, "name"),
    sku: text(formData, "sku") || null,
    price: Number(formData.get("price") ?? 0),
    costPrice: Number(formData.get("cost_price") ?? 0),
    categoryId: text(formData, "category_id") || null,
    unit: text(formData, "unit") || "pc",
    allowDecimal: formData.get("allow_decimal") !== null,
    barcode: text(formData, "barcode") || null,
    description: text(formData, "description") || null,
    // `undefined`, not 0, when absent (single-product-only fields — a
    // Product With Variants create has no default variant yet) so an
    // unrelated save never zeroes these out via UpdateProductController's
    // pass-through to the default variant.
    reorderPoint: formData.has("reorder_point") ? Number(formData.get("reorder_point")) : undefined,
    replenishQuantity: formData.has("replenish_quantity") ? Number(formData.get("replenish_quantity")) : undefined,
    // The two bulk fields live or die together, so an empty pair is two nulls
    // rather than a price with no minimum that would never apply.
    bulkPrice: optionalNumber(formData, "bulk_price"),
    bulkMinQuantity: optionalNumber(formData, "bulk_min_quantity"),
    isBundle: formData.has("is_bundle_field")
      ? formData.get("is_bundle") !== null
      : undefined,
    brandId: text(formData, "brand_id") || null,
    productType: text(formData, "product_type") || "physical",
    notes: text(formData, "notes") || null,
    isSellable: formData.get("is_sellable") !== null,
    isPurchasable: formData.get("is_purchasable") !== null,
    isTrackInventory: formData.get("is_track_inventory") !== null,
    skipDefaultVariant: formData.get("skip_default_variant") === "1",
    // Only present on single-SKU Details — with-variants hide visibility per variant.
    isActive: formData.has("is_active_field")
      ? formData.get("is_active") !== null
      : undefined,
  };
}

// Old Postgres constraint names (products_sku_key, etc) never reach the
// client through the Laravel API — validation now comes back as per-field
// messages on ApiError.errors instead, so field-key checks replace the old
// substring matches.
function describeSaveError(error: unknown): string {
  if (error instanceof ApiError && error.isValidation) {
    // Sku conflicts carry a specific "already used by X" message from the
    // backend (SkuConflict) — prefer it over a generic line.
    if (error.errors?.sku?.[0]) return error.errors.sku[0];
    if (error.errors?.barcode) return "That barcode is already on another product.";
    if (error.errors?.name) return "A product with that name already exists.";
    if (error.errors?.bulk_price || error.errors?.bulk_min_quantity) {
      return "Bulk pricing needs both a bulk price and a minimum quantity.";
    }
    const first = Object.values(error.errors ?? {})[0]?.[0];
    if (first) return first;
  }
  if (error instanceof ApiError && error.isForbidden) return error.message;
  const message = error instanceof Error ? error.message : "Unknown error";
  return `Could not save the product: ${message}`;
}

/**
 * Editing an existing product only — creation (both single-product and
 * with-variants) goes through `createFullProduct` (one-shot client-side
 * mutation) instead. See CLAUDE.md's rule that new admin work should be a
 * direct client-side call rather than a Server Action.
 */
export async function saveProduct(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const input = readProductForm(formData);

  const validation = validateProductInput(input);
  if (!validation.ok) {
    return { error: validation.errors.join(" "), ok: false };
  }

  // products.category is the flattened path text and belongs to a trigger.
  // Only the link is ever written from here.
  const row = {
    name: input.name,
    sku: input.sku,
    price: input.price,
    costPrice: input.costPrice,
    categoryId: input.categoryId,
    unit: input.unit,
    allowDecimal: input.allowDecimal,
    barcode: input.barcode,
    description: input.description,
    reorderPoint: input.reorderPoint,
    replenishQuantity: input.replenishQuantity,
    bulkPrice: input.bulkPrice,
    bulkMinQuantity: input.bulkMinQuantity,
    brandId: input.brandId,
    productType: input.productType,
    notes: input.notes,
    isSellable: input.isSellable,
    isPurchasable: input.isPurchasable,
    isTrackInventory: input.isTrackInventory,
    skipDefaultVariant: input.skipDefaultVariant,
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.isBundle !== undefined ? { isBundle: input.isBundle } : {}),
  };

  const client = getAuthedClient();

  try {
    // stock_quantity is deliberately absent: stock only moves through the
    // inventory page, which writes a movement row the trigger applies.
    await updateProduct(client, id, row);
  } catch (error) {
    return { error: describeSaveError(error), ok: false };
  }

  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/reports");
  return { error: null, ok: true };
}
