"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { isProductUnit, validateProductInput } from "@double-a/shared-types";
import {
  createProduct,
  extractProductsFromPhoto,
  listCategories,
  type ExtractedProductLine,
} from "@double-a/api-client/queries";
import { ApiError } from "@double-a/api-client";
import { toCategoryOptions } from "@/lib/category-options";
import { getAuthedClient } from "@/lib/api/session";
import { matchCategoryId } from "./match-category";
import type {
  ExtractProductsResult,
  SaveAllScannedResult,
  SaveScannedResult,
  ScannedProductDraft,
} from "./types";

// Old Postgres constraint names never reach the client through the Laravel
// API — validation now comes back as per-field messages on ApiError.errors.
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
  const message = error instanceof Error ? error.message : "Unknown error";
  return `Could not save the product: ${message}`;
}

function describeExtractError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error
    ? `Could not read the photo: ${error.message}`
    : "Could not read the photo. Try again.";
}

function lineToDraft(
  line: ExtractedProductLine,
  categories: { id: string; name: string; path: string }[],
): ScannedProductDraft {
  return {
    clientId: randomUUID(),
    name: line.name,
    description: line.description ?? "",
    sku: line.sku ?? "",
    barcode: line.barcode ?? "",
    price: line.price !== null ? String(line.price) : "",
    costPrice: line.costPrice !== null ? String(line.costPrice) : "",
    quantity: line.quantity !== null ? String(line.quantity) : "",
    categoryId: matchCategoryId(`${line.name} ${line.sku ?? ""}`, categories),
    unit: isProductUnit(line.unit) ? line.unit : "pc",
    reorderPoint: "5",
    bulkPrice: "",
    bulkMinQuantity: "",
    existingProductId: line.existingProductId,
    stockApplied: line.stockApplied,
  };
}

function draftToInput(draft: ScannedProductDraft) {
  const optionalNumber = (raw: string): number | null =>
    raw.trim() === "" ? null : Number(raw);

  return {
    name: draft.name.trim(),
    sku: draft.sku.trim() || null,
    price: Number(draft.price || 0),
    costPrice: Number(draft.costPrice || 0),
    categoryId: draft.categoryId.trim() || null,
    unit: draft.unit.trim() || "pc",
    barcode: draft.barcode.trim() || null,
    description: draft.description.trim() || null,
    reorderPoint: Number(draft.reorderPoint || 0),
    bulkPrice: optionalNumber(draft.bulkPrice),
    bulkMinQuantity: optionalNumber(draft.bulkMinQuantity),
  };
}

async function insertDraft(draft: ScannedProductDraft): Promise<string | null> {
  if (draft.stockApplied) {
    return "Stock was already recorded for this existing SKU.";
  }

  const input = draftToInput(draft);
  const validation = validateProductInput(input);
  if (!validation.ok) return validation.errors.join(" ");

  const client = getAuthedClient();
  try {
    await createProduct(client, {
      name: input.name,
      sku: input.sku,
      price: input.price,
      costPrice: input.costPrice,
      categoryId: input.categoryId,
      unit: input.unit,
      barcode: input.barcode,
      description: input.description,
      reorderPoint: input.reorderPoint,
      bulkPrice: input.bulkPrice,
      bulkMinQuantity: input.bulkMinQuantity,
    });
  } catch (error) {
    return describeSaveError(error);
  }

  return null;
}

/**
 * Reads product lines from a notebook photo. Vision extraction runs on the
 * Laravel API (ProductPhotoExtractor via Laravel AI / OpenAI). Existing SKUs with a
 * quantity get a restock movement server-side; new lines become editable drafts.
 */
export async function extractProductsFromImage(
  formData: FormData,
): Promise<ExtractProductsResult> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo, or take one with the camera.", drafts: [] };
  }

  if (!file.type.startsWith("image/")) {
    return { error: "That file is not an image.", drafts: [] };
  }

  // Phone JPEGs can be several MB; refuse anything the API will reject anyway.
  if (file.size > 5.5 * 1024 * 1024) {
    return {
      error: "Photo is too large (over 5.5 MB). Try a clearer, smaller shot.",
      drafts: [],
    };
  }

  const client = getAuthedClient();

  let lines: ExtractedProductLine[];
  try {
    lines = await extractProductsFromPhoto(client, file);
  } catch (error) {
    return { error: describeExtractError(error), drafts: [] };
  }

  if (lines.length === 0) {
    return {
      error:
        "No product lines found. Use a clearer photo with one product per row (name and price).",
      drafts: [],
    };
  }

  const categories = await listCategories(client, { includeInactive: true });
  const options = toCategoryOptions(categories);
  const drafts = lines.map((line) => lineToDraft(line, options));

  return { error: null, drafts };
}

export async function saveScannedProduct(
  draft: ScannedProductDraft,
): Promise<SaveScannedResult> {
  const error = await insertDraft(draft);
  if (error) return { error, ok: false, clientId: draft.clientId };

  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/reports");
  revalidatePath("/products/from-photo");
  return { error: null, ok: true, clientId: draft.clientId };
}

export async function saveAllScannedProducts(
  drafts: ScannedProductDraft[],
): Promise<SaveAllScannedResult> {
  if (drafts.length === 0) {
    return { error: "Nothing to save.", saved: 0, failures: [] };
  }

  const failures: { clientId: string; error: string }[] = [];
  let saved = 0;

  for (const draft of drafts) {
    if (draft.stockApplied) {
      saved += 1;
      continue;
    }
    const error = await insertDraft(draft);
    if (error) {
      failures.push({ clientId: draft.clientId, error });
    } else {
      saved += 1;
    }
  }

  if (saved > 0) {
    revalidatePath("/products");
    revalidatePath("/inventory");
    revalidatePath("/reports");
    revalidatePath("/products/from-photo");
  }

  return {
    error:
      failures.length === 0
        ? null
        : saved === 0
          ? "Nothing was saved. Fix the rows marked below."
          : `Saved ${saved}. ${failures.length} still need a fix.`,
    saved,
    failures,
  };
}
