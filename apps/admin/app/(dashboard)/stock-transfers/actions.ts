"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@double-a/api-client";
import {
  createStockTransfer,
  updateStockTransferStatus,
} from "@double-a/api-client/queries";
import type { StockTransferStatus } from "@double-a/shared-types";
import type { FormState } from "@/lib/form-state";
import { getAuthedClient } from "@/lib/api/session";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const firstFieldError = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return firstFieldError ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export async function saveTransfer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const fromLocationId = String(formData.get("from_location_id") ?? "").trim();
  const toLocationId = String(formData.get("to_location_id") ?? "").trim();
  const receiveNow = formData.get("receive_now") === "true";

  if (!fromLocationId || !toLocationId) {
    return { error: "Pick from and to locations.", ok: false };
  }
  if (fromLocationId === toLocationId) {
    return { error: "From and to must differ.", ok: false };
  }

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items_json") ?? "[]"));
  } catch {
    return { error: "Something went wrong reading the item list. Try again.", ok: false };
  }

  const items = (Array.isArray(rawItems) ? rawItems : [])
    .filter(
      (item): item is { productId: string; quantity: number } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { productId?: unknown }).productId === "string" &&
        (item as { productId: string }).productId !== "" &&
        typeof (item as { quantity?: unknown }).quantity === "number" &&
        (item as { quantity: number }).quantity > 0,
    );

  if (items.length === 0) {
    return { error: "Add at least one product with a quantity greater than zero.", ok: false };
  }

  try {
    await createStockTransfer(getAuthedClient(), {
      fromLocationId,
      toLocationId,
      items,
      receiveNow,
    });
  } catch (error) {
    return { error: errorMessage(error), ok: false };
  }

  revalidatePath("/stock-transfers");
  revalidatePath("/inventory");
  return { error: null, ok: true };
}

export async function setTransferStatus(
  id: string,
  status: StockTransferStatus,
): Promise<FormState> {
  try {
    await updateStockTransferStatus(getAuthedClient(), id, status);
  } catch (error) {
    return { error: errorMessage(error), ok: false };
  }
  revalidatePath("/stock-transfers");
  revalidatePath("/inventory");
  return { error: null, ok: true };
}
