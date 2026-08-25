"use server";

import { revalidatePath } from "next/cache";
import { validateProductInput } from "@double-a/shared-types";
import { createProduct, updateProduct } from "@double-a/api-client/queries";
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
    reorderPoint: Number(formData.get("reorder_point") ?? 0),
    // The two bulk fields live or die together, so an empty pair is two nulls
    // rather than a price with no minimum that would never apply.
    bulkPrice: optionalNumber(formData, "bulk_price"),
    bulkMinQuantity: optionalNumber(formData, "bulk_min_quantity"),
  };
}

// Old Postgres constraint names (products_sku_key, etc) never reach the
// client through the Laravel API — validation now comes back as per-field
// messages on ApiError.errors instead, so field-key checks replace the old
// substring matches.
function describeSaveError(error: unknown): string {
  if (error instanceof ApiError && error.isValidation) {
    if (error.errors?.sku) return "That SKU is already used by another product.";
    if (error.errors?.barcode) return "That barcode is already on another product.";
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
    reorderPoint: input.reorderPoint,
    bulkPrice: input.bulkPrice,
    bulkMinQuantity: input.bulkMinQuantity,
  };

  const client = getAuthedClient();

  try {
    if (id) {
      // stock_quantity is deliberately absent: stock only moves through the
      // inventory page, which writes a movement row the trigger applies.
      await updateProduct(client, id, row);
    } else {
      await createProduct(client, row);
    }
  } catch (error) {
    return { error: describeSaveError(error), ok: false };
  }

  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/reports");
  return { error: null, ok: true };
}
