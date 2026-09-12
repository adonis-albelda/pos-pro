"use server";

import { revalidatePath } from "next/cache";
import { listProductsPage, patchSaleFlags, refundSaleItem, replaceSaleItem, voidSale } from "@double-a/api-client/queries";
import type { Product } from "@double-a/shared-types";
import { getAuthedClient } from "@/lib/api/session";

/**
 * Voiding is the only full-sale reversal — a sale is never deleted. Laravel's
 * SaleObserver restores stock as the sale flips to voided.
 */
export async function voidSaleAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await voidSale(getAuthedClient(), id);

  revalidatePath(`/sales/${id}`);
  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/");
}

export async function searchProductsForReplace(q: string): Promise<Product[]> {
  const client = getAuthedClient();
  const { products } = await listProductsPage(client, { q, page: 1, pageSize: 8 });
  return products;
}

/**
 * Swaps a line item for a different product. The original row is never
 * rewritten — it stays exactly as it was charged and is only flagged; the
 * replacement is a new line. See ReplaceSaleItemAction (Laravel) for the
 * full mechanics — stock/total_amount are handled server-side.
 */
export async function replaceSaleItemAction(
  saleId: string,
  saleItemId: string,
  productId: string,
  quantity?: number,
): Promise<void> {
  await replaceSaleItem(getAuthedClient(), saleId, saleItemId, { productId, quantity });

  revalidatePath(`/sales/${saleId}`);
  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/");
}

/**
 * Refunds one line. Original charge stays on the record; stock comes back;
 * total drops that line. See RefundSaleItemAction (Laravel).
 */
export async function refundSaleItemAction(saleId: string, saleItemId: string): Promise<void> {
  await refundSaleItem(getAuthedClient(), saleId, saleItemId);

  revalidatePath(`/sales/${saleId}`);
  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/");
}

/** Both flags are required together — see sale-flags.tsx. fulfillment can no longer be changed here. */
export async function patchSaleFlagsAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const isPaid = formData.get("is_paid") === "true";
  const deliveryCompleted = formData.get("delivery_completed") === "true";

  await patchSaleFlags(getAuthedClient(), id, { isPaid, deliveryCompleted });

  revalidatePath(`/sales/${id}`);
  revalidatePath("/sales");
  revalidatePath("/customers");
}
