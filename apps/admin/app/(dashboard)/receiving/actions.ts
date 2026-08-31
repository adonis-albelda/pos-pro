"use server";

import { revalidatePath } from "next/cache";
import {
  createGoodsReceipt,
  extractGoodsReceiptPhoto,
  type GoodsReceiptItemInput,
  type ExtractedReceiptLine,
} from "@double-a/api-client/queries";
import { ApiError } from "@double-a/api-client";
import { getAuthedClient } from "@/lib/api/session";

function describeExtractError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return "OpenAI is busy. Wait about a minute, then try again.";
    }
    if (error.status === 402) {
      return "OpenAI has no credits left. Check billing or the API key on the server.";
    }
    if (error.status === 403) {
      return error.message;
    }
  }
  return error instanceof Error
    ? `Could not read the photo: ${error.message}`
    : "Could not read the photo. Try again.";
}

export async function extractGoodsReceiptPhotoAction(
  formData: FormData,
): Promise<{ error: string | null; lines: ExtractedReceiptLine[]; quotaExceeded?: boolean }> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo, or take one with the camera.", lines: [] };
  }

  if (!file.type.startsWith("image/")) {
    return { error: "That file is not an image.", lines: [] };
  }

  if (file.size > 5.5 * 1024 * 1024) {
    return {
      error: "Photo is too large (over 5.5 MB). Try a clearer, smaller shot.",
      lines: [],
    };
  }

  const purchaseOrderId = formData.get("purchase_order_id");
  const client = getAuthedClient();

  try {
    const lines = await extractGoodsReceiptPhoto(
      client,
      file,
      typeof purchaseOrderId === "string" && purchaseOrderId ? purchaseOrderId : null,
    );

    if (lines.length === 0) {
      return {
        error: "No line items found. Use a clearer shot with one item per row.",
        lines: [],
      };
    }

    return { error: null, lines };
  } catch (error) {
    // 403 here is specifically CompanyAiQuotaExceededException — the weekly
    // free-read cap. Callers surface this one as a dedicated dialog with a
    // link to Settings, not just an inline error line.
    return {
      error: describeExtractError(error),
      lines: [],
      quotaExceeded: error instanceof ApiError && error.status === 403,
    };
  }
}

function describeSaveError(error: unknown): string {
  if (error instanceof ApiError && error.isValidation) {
    const first = Object.values(error.errors ?? {})[0]?.[0];
    if (first) return first;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return `Could not save this receipt: ${message}`;
}

/**
 * Takes a FormData (not a typed object) so the photo File travels the same
 * way `extractGoodsReceiptPhotoAction` above already does — the established
 * convention in this app for any server action carrying an upload.
 */
export async function createGoodsReceiptAction(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const locationId = String(formData.get("location_id") ?? "");
  if (!locationId) {
    return { ok: false, error: "Pick which branch this delivery landed at." };
  }

  const itemsRaw = String(formData.get("items_json") ?? "[]");
  let items: GoodsReceiptItemInput[];
  try {
    items = JSON.parse(itemsRaw) as GoodsReceiptItemInput[];
  } catch {
    return { ok: false, error: "Something went wrong reading the item list. Try again." };
  }

  if (items.length === 0) {
    return { ok: false, error: "Add at least one item." };
  }

  const supplierId = String(formData.get("supplier_id") ?? "") || null;
  const supplierName = String(formData.get("supplier_name") ?? "") || null;
  const purchaseOrderId = String(formData.get("purchase_order_id") ?? "") || null;
  const referenceNo = String(formData.get("reference_no") ?? "") || null;
  const notes = String(formData.get("notes") ?? "") || null;
  const photoField = formData.get("photo");
  const photo = photoField instanceof File && photoField.size > 0 ? photoField : null;
  const galleryPhotoId = String(formData.get("gallery_photo_id") ?? "") || null;

  const client = getAuthedClient();

  try {
    const receipt = await createGoodsReceipt(client, {
      locationId,
      supplierId,
      supplierName,
      purchaseOrderId,
      referenceNo,
      notes,
      photo,
      galleryPhotoId,
      items,
    });

    revalidatePath("/receiving");
    revalidatePath("/products");
    revalidatePath("/inventory");
    revalidatePath("/reports");
    if (purchaseOrderId) {
      revalidatePath(`/purchase-orders/${purchaseOrderId}`);
    }

    return { ok: true, id: receipt.id };
  } catch (error) {
    return { ok: false, error: describeSaveError(error) };
  }
}
