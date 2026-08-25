"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@double-a/api-client";
import { updateReceiptLayout } from "@double-a/api-client/queries";
import type { FormState } from "@/lib/form-state";
import { getAuthedClient, getCurrentUser } from "@/lib/api/session";
import { isShopAdmin } from "@/lib/authz";

function checked(formData: FormData, key: string): boolean {
  return formData.get(key) === "true" || formData.get(key) === "on";
}

export async function saveReceiptLayout(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!isShopAdmin(user)) {
    return { error: "Only the owner can edit the receipt layout.", ok: false };
  }

  try {
    await updateReceiptLayout(getAuthedClient(), {
      showShopName: checked(formData, "show_shop_name"),
      showAddress: checked(formData, "show_address"),
      showPhone: checked(formData, "show_phone"),
      showLogoLine: checked(formData, "show_logo_line"),
      showCashier: checked(formData, "show_cashier"),
      showTerminal: checked(formData, "show_terminal"),
      showCustomer: checked(formData, "show_customer"),
      showDiscounts: checked(formData, "show_discounts"),
      showPayment: checked(formData, "show_payment"),
      showFooter: checked(formData, "show_footer"),
    });
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      return { error: error.message, ok: false };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Could not save the receipt layout: ${message}`, ok: false };
  }

  revalidatePath("/receipt");
  return { error: null, ok: true };
}
