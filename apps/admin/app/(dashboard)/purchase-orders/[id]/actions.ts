"use server";

import { revalidatePath } from "next/cache";
import type { PurchaseOrderStatus, User } from "@double-a/shared-types";
import { isValidQuantity, QUANTITY_DECIMALS } from "@double-a/shared-types";
import {
  markPaymentPaid,
  markPaymentUnpaid,
  receivePurchaseOrderItem,
  setPurchaseOrderStatus,
} from "@double-a/api-client/queries";
import type { ApiClient } from "@double-a/api-client";
import { getAuthedClient, getCurrentUser } from "@/lib/api/session";
import { isShopAdmin } from "@/lib/authz";

/** draft -> ordered and (draft | ordered) -> cancelled are the only manual jumps. */
const MANUAL_STATUSES: PurchaseOrderStatus[] = ["ordered", "cancelled"];

function revalidatePurchaseOrderViews(id: string) {
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/purchase-orders");
  revalidatePath("/suppliers");
  revalidatePath("/");
}

async function adminContext(): Promise<{ client: ApiClient; user: User } | null> {
  const user = await getCurrentUser();
  if (!isShopAdmin(user)) return null;
  return { client: getAuthedClient(), user };
}

/** currentReceived comes off the already-loaded PO detail — no GET to refetch it from (see queries/purchase-orders.ts). */
export async function receivePurchaseOrderItemAction(
  formData: FormData,
): Promise<{ error: string | null }> {
  const itemId = String(formData.get("item_id") ?? "");
  const purchaseOrderId = String(formData.get("purchase_order_id") ?? "");
  const currentReceived = Number(formData.get("current_received") ?? 0);
  const quantity = Number(formData.get("quantity") ?? 0);

  if (!itemId || !purchaseOrderId) return { error: "Missing line item." };
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: "Enter how many actually arrived." };
  }

  const ctx = await adminContext();
  if (!ctx) return { error: "Only the owner can receive stock on a purchase order." };

  const received = Number(quantity.toFixed(QUANTITY_DECIMALS));
  if (!isValidQuantity(received, 1)) {
    return { error: "This product is sold in whole numbers — enter a whole quantity." };
  }

  try {
    await receivePurchaseOrderItem(ctx.client, {
      itemId,
      purchaseOrderId,
      currentQuantityReceived: currentReceived,
      quantity: received,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: message };
  }

  revalidatePurchaseOrderViews(purchaseOrderId);
  return { error: null };
}

export async function markPaymentPaidAction(formData: FormData): Promise<void> {
  const paymentId = String(formData.get("payment_id") ?? "");
  const purchaseOrderId = String(formData.get("purchase_order_id") ?? "");
  if (!paymentId) return;

  const ctx = await adminContext();
  if (!ctx) return;

  await markPaymentPaid(ctx.client, paymentId, purchaseOrderId);
  revalidatePurchaseOrderViews(purchaseOrderId);
}

export async function markPaymentUnpaidAction(formData: FormData): Promise<void> {
  const paymentId = String(formData.get("payment_id") ?? "");
  const purchaseOrderId = String(formData.get("purchase_order_id") ?? "");
  if (!paymentId) return;

  const ctx = await adminContext();
  if (!ctx) return;

  await markPaymentUnpaid(ctx.client, paymentId, purchaseOrderId);
  revalidatePurchaseOrderViews(purchaseOrderId);
}

export async function updatePurchaseOrderStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !MANUAL_STATUSES.includes(status as PurchaseOrderStatus)) return;

  const ctx = await adminContext();
  if (!ctx) return;

  await setPurchaseOrderStatus(ctx.client, id, status as PurchaseOrderStatus);
  revalidatePurchaseOrderViews(id);
}
