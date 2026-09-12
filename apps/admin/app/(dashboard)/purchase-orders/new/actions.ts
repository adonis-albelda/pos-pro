"use server";

import { revalidatePath } from "next/cache";
import { roundMoney } from "@double-a/shared-types";
import { addPurchaseOrderItem, createPurchaseOrder } from "@double-a/api-client/queries";
import { getAuthedClient, getCurrentUser } from "@/lib/api/session";
import { isShopAdmin } from "@/lib/authz";

export interface CreatePurchaseOrderInput {
  supplierId: string;
  locationId: string | null;
  orderDate: string;
  expectedDate: string | null;
  referenceNo: string | null;
  notes: string | null;
  items: {
    productId: string;
    productName: string;
    quantityOrdered: number;
    unitCost: number;
  }[];
}

export type CreatePurchaseOrderResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Called directly from the client builder (not bound to a <form action>), so
 * it takes a plain object rather than FormData — the item rows are already
 * structured on that side.
 *
 * GAP: the old `createPurchaseOrder` inserted header + items in one call (see
 * queries/purchase-orders.ts). `StorePurchaseOrderController` only accepts
 * header fields — items are separate nested POSTs afterward, not
 * transactional. If a later item fails, the header (and whatever lines
 * already landed) still exists and is editable from its detail page — this
 * returns the created id either way so the caller can navigate there and
 * finish by hand.
 *
 * Payment-terms (installment schedule) input was removed from this form —
 * nothing here called it before submitting either. `addPurchaseOrderPayment`
 * (queries/purchase-orders.ts) still exists on the API client if a future
 * detail-page UI wires it up.
 */
export async function createPurchaseOrderAction(
  input: CreatePurchaseOrderInput,
): Promise<CreatePurchaseOrderResult> {
  if (!input.supplierId) return { ok: false, error: "Pick a supplier." };
  if (input.items.length === 0) {
    return { ok: false, error: "Add at least one line item." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.orderDate)) {
    return { ok: false, error: "Pick a valid order date." };
  }

  const user = await getCurrentUser();
  if (!isShopAdmin(user)) {
    return { ok: false, error: "Only the owner can create a purchase order." };
  }

  const client = getAuthedClient();

  try {
    const order = await createPurchaseOrder(client, {
      supplierId: input.supplierId,
      locationId: input.locationId,
      orderDate: input.orderDate,
      expectedDate: input.expectedDate,
      referenceNo: input.referenceNo,
      notes: input.notes,
    });

    for (const item of input.items) {
      await addPurchaseOrderItem(client, order.id, {
        productId: item.productId,
        productName: item.productName,
        quantityOrdered: Math.max(1, Math.round(item.quantityOrdered)),
        unitCost: roundMoney(item.unitCost),
      });
    }

    revalidatePath("/purchase-orders");
    revalidatePath("/suppliers");
    revalidatePath("/");
    return { ok: true, id: order.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: `Could not create the purchase order: ${message}` };
  }
}
