"use server";

import { revalidatePath } from "next/cache";
import { createSale } from "@double-a/api-client/queries";
import { getAuthedClient } from "@/lib/api/session";

export interface CreateSaleLine {
  productId: string;
  quantity: number;
  unitPrice?: number;
}

/**
 * A sale rung up directly in the office — e.g. a phone order — rather than
 * synced from a POS terminal. See CreateSaleAction (Laravel): stock is
 * decremented and list_price/unit_cost are snapshotted the same way a
 * normal sale line is.
 */
export async function createSaleAction(input: {
  items: CreateSaleLine[];
  paymentMethod: "cash" | "gcash" | "card";
  customerId?: string;
  isPaid?: boolean;
  fulfillment?: "pickup" | "delivery";
}): Promise<{ id: string }> {
  const sale = await createSale(getAuthedClient(), input);

  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/customers");
  revalidatePath("/");

  // Returns the id rather than calling redirect() itself — this runs
  // inside the client's try/catch (see create-sale-form.tsx), and
  // Next.js's redirect() throws a control-flow signal that a surrounding
  // catch would otherwise swallow as a real error.
  return { id: sale.id };
}
