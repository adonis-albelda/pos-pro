"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@double-a/api-client";
import {
  createCustomer,
  deleteCustomer,
  recordCustomerPayment,
  updateCustomer,
} from "@double-a/api-client/queries";
import {
  CUSTOMER_FIELD_MAX_LENGTH,
  normaliseCustomerDetails,
} from "@double-a/shared-types";
import type { FormState } from "@/lib/form-state";
import { getAuthedClient } from "@/lib/api/session";

function revalidateCustomerViews(id?: string) {
  revalidatePath("/customers");
  revalidatePath("/sales");
  if (id) revalidatePath(`/customers/${id}`);
}

export async function saveCustomer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const details = normaliseCustomerDetails({
    name: String(formData.get("name") ?? ""),
    address: String(formData.get("address") ?? ""),
    contact: String(formData.get("contact") ?? ""),
  });

  if (!details.name) {
    return { error: "Give the customer a name.", ok: false };
  }

  const client = getAuthedClient();
  const row = {
    name: details.name.slice(0, CUSTOMER_FIELD_MAX_LENGTH),
    address: details.address,
    contact: details.contact,
  };

  try {
    if (id) {
      await updateCustomer(client, id, row);
      revalidateCustomerViews(id);
    } else {
      const created = await createCustomer(client, row);
      revalidateCustomerViews(created.id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Could not save the customer: ${message}`, ok: false };
  }

  return { error: null, ok: true };
}

/**
 * Returns a result object rather than throwing — an uncaught Server Action
 * error only crosses to the client as a generic message, and this needs the
 * specific "outstanding balance" / "payment history" reason
 * DestroyCustomerController sends back (see CLAUDE.md's utang ledger).
 */
export async function removeCustomer(formData: FormData): Promise<{ error: string | null }> {
  const id = String(formData.get("id") ?? "");
  const client = getAuthedClient();

  try {
    await deleteCustomer(client, id);
  } catch (error) {
    if (error instanceof ApiError && error.isValidation) {
      return { error: error.errors?.customer?.[0] ?? "Could not delete this customer." };
    }
    return { error: error instanceof Error ? error.message : "Could not delete this customer." };
  }

  revalidateCustomerViews();
  return { error: null };
}

export async function recordCustomerPaymentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const customerId = String(formData.get("customer_id") ?? "");
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();

  if (!amount || amount <= 0) {
    return { error: "Enter an amount greater than zero.", ok: false };
  }

  try {
    await recordCustomerPayment(getAuthedClient(), customerId, {
      amount,
      note: note ? note : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Could not record this payment: ${message}`, ok: false };
  }

  revalidateCustomerViews(customerId);
  return { error: null, ok: true };
}
