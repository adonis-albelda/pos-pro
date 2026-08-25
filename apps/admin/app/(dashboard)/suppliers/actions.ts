"use server";

import { revalidatePath } from "next/cache";
import {
  SUPPLIER_ADDRESS_MAX,
  SUPPLIER_CONTACT_PERSON_MAX,
  SUPPLIER_EMAIL_MAX,
  SUPPLIER_NAME_MAX,
  SUPPLIER_PHONE_MAX,
} from "@double-a/shared-types";
import { ApiError } from "@double-a/api-client";
import {
  createSupplier,
  deleteSupplier,
  setSupplierProducts,
  updateSupplier,
} from "@double-a/api-client/queries";
import type { FormState } from "@/lib/form-state";
import { getAuthedClient, getCurrentUser } from "@/lib/api/session";
import { isShopAdmin } from "@/lib/authz";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string, max: number): string | null {
  const value = text(formData, key);
  return value ? value.slice(0, max) : null;
}

function revalidateSupplierViews(id?: string) {
  revalidatePath("/suppliers");
  revalidatePath("/purchase-orders");
  revalidatePath("/");
  if (id) revalidatePath(`/suppliers/${id}`);
}

export async function saveSupplier(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, "id");
  const name = text(formData, "name");
  const productIds = text(formData, "product_ids")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  // The active checkbox only renders once a supplier already exists — a new
  // one is always active on creation.
  const isActive = id ? formData.get("is_active") === "true" : true;

  if (!name) {
    return { error: "Give the supplier a name.", ok: false };
  }

  const client = getAuthedClient();
  const user = await getCurrentUser();
  if (!isShopAdmin(user)) {
    return { error: "Only the owner can manage suppliers.", ok: false };
  }

  const row = {
    name: name.slice(0, SUPPLIER_NAME_MAX),
    contactPerson: optional(formData, "contact_person", SUPPLIER_CONTACT_PERSON_MAX),
    phone: optional(formData, "phone", SUPPLIER_PHONE_MAX),
    email: optional(formData, "email", SUPPLIER_EMAIL_MAX),
    address: optional(formData, "address", SUPPLIER_ADDRESS_MAX),
    isActive,
  };

  try {
    const supplierId = id
      ? (await updateSupplier(client, id, row)).id
      : (await createSupplier(client, row)).id;
    // GAP (see suppliers/page.tsx): there is no read-back endpoint for a
    // supplier's linked products, so `productIds` here is only ever what the
    // form's checkboxes carried — never pre-populated from what's actually
    // linked server-side on an edit. `setSupplierProducts` is a replace-all,
    // so saving an edit without re-checking every product the supplier
    // already carries silently unlinks the rest.
    await setSupplierProducts(client, supplierId, productIds);
    revalidateSupplierViews(supplierId);
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      return { error: error.message, ok: false };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Could not save the supplier: ${message}`, ok: false };
  }

  return { error: null, ok: true };
}

/**
 * `purchase_orders.supplier_id` is `on delete restrict`, so this throws once
 * the supplier has any order history. Returned as a result instead of left to
 * throw, so the button can explain "deactivate instead" rather than crash.
 */
export async function removeSupplier(formData: FormData): Promise<{ error: string | null }> {
  const id = text(formData, "id");
  if (!id) return { error: null };

  const client = getAuthedClient();
  const user = await getCurrentUser();
  if (!isShopAdmin(user)) {
    return { error: "Only the owner can manage suppliers." };
  }

  try {
    await deleteSupplier(client, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isRestricted =
      error instanceof ApiError &&
      (error.isConflict || message.toLowerCase().includes("foreign key"));
    return {
      error: isRestricted
        ? "This supplier has purchase orders on file and cannot be deleted. Turn off \u201cActive\u201d instead."
        : `Could not delete the supplier: ${message}`,
    };
  }

  revalidateSupplierViews();
  return { error: null };
}
