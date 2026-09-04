"use server";

import { revalidatePath } from "next/cache";
import {
  SUPPLIER_ADDRESS_MAX,
  SUPPLIER_CONTACT_PERSON_MAX,
  SUPPLIER_EMAIL_MAX,
  SUPPLIER_NAME_MAX,
  SUPPLIER_NOTES_MAX,
  SUPPLIER_PHONE_MAX,
  SUPPLIER_TIN_MAX,
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
    secondaryPhone: optional(formData, "secondary_phone", SUPPLIER_PHONE_MAX),
    email: optional(formData, "email", SUPPLIER_EMAIL_MAX),
    secondaryEmail: optional(formData, "secondary_email", SUPPLIER_EMAIL_MAX),
    address: optional(formData, "address", SUPPLIER_ADDRESS_MAX),
    tin: optional(formData, "tin", SUPPLIER_TIN_MAX),
    notes: optional(formData, "notes", SUPPLIER_NOTES_MAX),
    isActive,
  };

  try {
    const supplierId = id
      ? (await updateSupplier(client, id, row)).id
      : (await createSupplier(client, row)).id;
    // setSupplierProducts is a replace-all — callers must pass the full set
    // they want linked, not a delta. Both call sites of this action
    // (create sheet, list page's edit sheet) pre-check the picker from
    // listSupplierProducts before rendering, so `productIds` here already
    // reflects everything that should stay linked, not just what changed.
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

/** Fields only, no product links — the detail page's Info tab, separate from its Products tab's own save. */
export async function saveSupplierInfo(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, "id");
  const name = text(formData, "name");

  if (!id) return { error: "Missing supplier.", ok: false };
  if (!name) return { error: "Give the supplier a name.", ok: false };

  const client = getAuthedClient();
  const user = await getCurrentUser();
  if (!isShopAdmin(user)) {
    return { error: "Only the owner can manage suppliers.", ok: false };
  }

  const row = {
    name: name.slice(0, SUPPLIER_NAME_MAX),
    contactPerson: optional(formData, "contact_person", SUPPLIER_CONTACT_PERSON_MAX),
    phone: optional(formData, "phone", SUPPLIER_PHONE_MAX),
    secondaryPhone: optional(formData, "secondary_phone", SUPPLIER_PHONE_MAX),
    email: optional(formData, "email", SUPPLIER_EMAIL_MAX),
    secondaryEmail: optional(formData, "secondary_email", SUPPLIER_EMAIL_MAX),
    address: optional(formData, "address", SUPPLIER_ADDRESS_MAX),
    tin: optional(formData, "tin", SUPPLIER_TIN_MAX),
    notes: optional(formData, "notes", SUPPLIER_NOTES_MAX),
    isActive: formData.get("is_active") === "true",
  };

  try {
    await updateSupplier(client, id, row);
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      return { error: error.message, ok: false };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Could not save the supplier: ${message}`, ok: false };
  }

  revalidateSupplierViews(id);
  return { error: null, ok: true };
}

/** Linked products only — a replace-all, so this always sends the full checked set, not a delta. */
export async function saveSupplierProducts(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = text(formData, "id");
  const productIds = text(formData, "product_ids")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!id) return { error: "Missing supplier.", ok: false };

  const client = getAuthedClient();
  const user = await getCurrentUser();
  if (!isShopAdmin(user)) {
    return { error: "Only the owner can manage suppliers.", ok: false };
  }

  try {
    await setSupplierProducts(client, id, productIds);
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      return { error: error.message, ok: false };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Could not save linked products: ${message}`, ok: false };
  }

  revalidateSupplierViews(id);
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
