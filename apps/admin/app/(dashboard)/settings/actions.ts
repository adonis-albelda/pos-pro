"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@double-a/api-client";
import { deleteStoreLogo, updateStoreSettings, uploadStoreLogo } from "@double-a/api-client/queries";
import type { FormState } from "@/lib/form-state";
import { getAuthedClient } from "@/lib/api/session";

/** Comfortably past any real shop logo, well under the server action body cap. */
const MAX_LOGO_BYTES = 1_000_000;

const LOGO_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/** Blank stays blank: an empty box means "nothing to print", not an empty string. */
function optional(formData: FormData, field: string): string | null {
  const value = String(formData.get(field) ?? "").trim();
  return value || null;
}

export async function saveStoreSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "The shop name is required — it heads every terminal.", ok: false };
  }

  const logo = formData.get("logo");
  const file = logo instanceof File && logo.size > 0 ? logo : null;
  const removeLogo = String(formData.get("remove_logo") ?? "") === "on";

  if (file) {
    if (!LOGO_EXTENSIONS[file.type]) {
      return { error: "The logo must be a PNG, JPEG, WebP or SVG image.", ok: false };
    }
    if (file.size > MAX_LOGO_BYTES) {
      return { error: "The logo must be under 1 MB.", ok: false };
    }
  }

  const invoiceDigits = Number(formData.get("invoice_digits") ?? 6);
  if (!Number.isInteger(invoiceDigits) || invoiceDigits < 1 || invoiceDigits > 12) {
    return { error: "Invoice digits must be a whole number between 1 and 12.", ok: false };
  }

  const invoiceNextNumber = Number(formData.get("invoice_next_number") ?? 1);
  if (!Number.isInteger(invoiceNextNumber) || invoiceNextNumber < 1) {
    return { error: "Next invoice number must be a whole number of at least 1.", ok: false };
  }

  const client = getAuthedClient();

  try {
    if (removeLogo) {
      await deleteStoreLogo(client);
    } else if (file) {
      await uploadStoreLogo(client, file);
    }

    await updateStoreSettings(client, {
      name,
      address: optional(formData, "address"),
      phone: optional(formData, "phone"),
      receiptFooter: optional(formData, "receipt_footer"),
      invoicePrefix: optional(formData, "invoice_prefix"),
      invoiceDigits,
      invoiceNextNumber,
    });
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      return { error: error.message, ok: false };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Could not save: ${message}`, ok: false };
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}
