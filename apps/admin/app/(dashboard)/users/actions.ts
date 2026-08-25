"use server";

import { revalidatePath } from "next/cache";
import { isValidPin } from "@double-a/shared-types";
import { ApiError } from "@double-a/api-client";
import { createUser, setUserPin, updateUser } from "@double-a/api-client/queries";
import type { FormState } from "@/lib/form-state";
import { getAuthedClient } from "@/lib/api/session";

/** Roles that unlock a terminal with a PIN. Admins optionally. */
function canUnlockWithPin(role: string): boolean {
  return role === "cashier" || role === "admin";
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const firstFieldError = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return firstFieldError ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

/**
 * GAP: `PATCH /users/{id}` (UpdateUserRequest) accepts neither `role` nor
 * `password` — an existing person's role or dashboard/terminal password
 * cannot be changed from here. A password reset now requires a superadmin,
 * via the Platform surface's "Reset password" (which forces
 * must_change_password too). Ask backend for a company-admin-scoped reset
 * endpoint if that trip is too heavy for daily use.
 *
 * GAP: creating a new admin from this form cannot force
 * must_change_password on first login either — StoreUserRequest doesn't
 * accept it, and only a superadmin's reset-password call can set it. New
 * admins created here sign in with the password chosen and are not prompted
 * to change it.
 */
export async function saveCashier(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "cashier");
  const pin = String(formData.get("pin") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const canSell = formData.get("can_sell") === "true";

  if (!name) return { error: "Name is required.", ok: false };
  if (!email) return { error: "Email is required — it identifies the person.", ok: false };

  if (!id && role === "superadmin") {
    return { error: "A shop cannot create a platform superadmin.", ok: false };
  }

  if (pin && !isValidPin(pin)) {
    return { error: "The PIN must be 4 to 6 digits.", ok: false };
  }
  if (role === "cashier" && !id && !pin) {
    return { error: "Set a PIN so this cashier can unlock a terminal.", ok: false };
  }

  if (!id && role === "admin" && !password) {
    return { error: "Set a password so this admin can sign in to the dashboard.", ok: false };
  }
  if (!id && role === "device" && !password) {
    return { error: "Set a password so this terminal can sign in on the POS app.", ok: false };
  }
  if (!id && password && password.length < 8) {
    return { error: "Password must be at least 8 characters.", ok: false };
  }

  const client = getAuthedClient();

  try {
    if (id) {
      if (password) {
        return {
          error:
            "Password changes for an existing person aren't available from this dashboard — ask the platform operator to reset it.",
          ok: false,
        };
      }

      await updateUser(client, id, { name, email, canSell: role === "device" ? true : canSell });
      if (canUnlockWithPin(role) && pin) {
        await setUserPin(client, id, pin);
      }
    } else {
      const created = await createUser(client, {
        name,
        email,
        role: role === "admin" || role === "device" ? role : "cashier",
        password: role === "admin" || role === "device" ? password : undefined,
        canSell,
      });
      if (canUnlockWithPin(role) && pin) {
        await setUserPin(client, created.id, pin);
      }
    }
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      return { error: error.message, ok: false };
    }
    return { error: `Could not save: ${errorMessage(error)}`, ok: false };
  }

  revalidatePath("/users");
  return { error: null, ok: true };
}

/**
 * GAP: no company-admin-scoped password reset endpoint (see saveCashier's
 * doc comment) — only a superadmin can reset a password (Platform surface),
 * and that always forces must_change_password. Kept as a stub, rather than
 * removed, so `users-table.tsx`'s existing "Reset password" control still
 * renders a clear message instead of a broken import.
 */
export async function resetUserPassword(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  return {
    error:
      "Password resets now go through a superadmin on the Platform surface — this dashboard can no longer do it directly.",
    ok: false,
  };
}

/** Floor staff: unlock still works; completing a sale does not. */
export async function toggleUserCanSell(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const canSell = String(formData.get("can_sell") ?? "") === "true";

  await updateUser(getAuthedClient(), id, { canSell });
  revalidatePath("/users");
}

export async function toggleCashierActive(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";

  await updateUser(getAuthedClient(), id, { isActive });
  revalidatePath("/users");
}
