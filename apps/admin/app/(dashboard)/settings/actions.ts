"use server";

import { revalidatePath } from "next/cache";
import { updateStoreSettings } from "@double-a/api-client/queries";
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
    // GAP (see packages/api-client/src/queries/settings.ts): the Tally API's
    // `store_settings.logo_url` is a plain string column with no file-upload
    // endpoint behind it, unlike Supabase Storage's `store-logos` bucket +
    // `uploadStoreLogo()`. There is nothing to call with a File here, so a
    // chosen file is refused with a clear message rather than silently
    // ignored or faked. `StoreForm` (apps/admin/app/(dashboard)/settings/store-form.tsx,
    // out of scope for this change) still renders a bare file picker with no
    // URL-text fallback; it should be updated to disable/hide that control,
    // or to accept a pasted URL instead, once this is picked up.
    return {
      error:
        "Logo upload isn't available yet on the new backend — there is no file storage endpoint. Ask an engineer to add one before setting a new logo. Existing logos can still be removed below.",
      ok: false,
    };
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
    await updateStoreSettings(client, {
      name,
      address: optional(formData, "address"),
      phone: optional(formData, "phone"),
      receiptFooter: optional(formData, "receipt_footer"),
      invoicePrefix: optional(formData, "invoice_prefix"),
      invoiceDigits,
      invoiceNextNumber,
      // "remove" clears the column; otherwise leave whatever is there.
      ...(removeLogo ? { logoUrl: null } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Could not save: ${message}`, ok: false };
  }

  revalidatePath("/settings");
  // The sidebar reads the shop name, and it is rendered by the dashboard layout.
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}
