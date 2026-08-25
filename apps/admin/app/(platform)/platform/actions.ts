"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { isValidPin } from "@double-a/shared-types";
import { ApiError } from "@double-a/api-client";
import {
  createCompany as apiCreateCompany,
  createUser,
  listUsers,
  openCompany as apiOpenCompany,
  resetUserPassword,
  resetUserPin,
  setCompanyInvoiceMode,
  setUserDemoFlag,
  updateCompany,
} from "@double-a/api-client/queries";
import type { FormState } from "@/lib/form-state";
import { requireSuperadmin } from "@/lib/platform";
import { createScopedClient } from "@/lib/api/client";
import { exitActingSession, setActingSession } from "@/lib/api/session";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const firstFieldError = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return firstFieldError ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

/**
 * StoreCompanyController creates the company's first admin atomically but
 * has no `must_change_password`/PIN fields (GAP — see migration notes) and
 * returns only the company, not the admin's id. This opens the freshly
 * created company (a superadmin action, not user-visible navigation — the
 * caller's own session/acting-company cookie is untouched), finds the admin
 * it just created, then rides `resetUserPassword`'s side effect of forcing
 * `must_change_password = true` (setting it to the SAME password already
 * chosen) and `resetUserPin` to apply the PIN — both superadmin-only
 * endpoints, valid on this one-off scoped token regardless of company.
 */
async function bootstrapCompanyAdmin(companyId: string, password: string, pin: string): Promise<void> {
  const { client: superadminClient } = await requireSuperadmin();
  const opened = await apiOpenCompany(superadminClient, companyId);
  const scoped = createScopedClient(opened.token);

  const users = await listUsers(scoped, { includeInactive: true });
  const admin = users.find((u) => u.role === "admin");
  if (!admin) throw new Error("Company was created but its admin user could not be found to finish setup.");

  await resetUserPassword(scoped, admin.id, password);
  await resetUserPin(scoped, admin.id, pin);
}

export async function createCompany(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { client } = await requireSuperadmin();

  const name = String(formData.get("name") ?? "").trim();
  const adminName = String(formData.get("admin_name") ?? "").trim();
  const adminEmail = String(formData.get("admin_email") ?? "").trim();
  const adminPassword = String(formData.get("admin_password") ?? "");
  const adminPin = String(formData.get("admin_pin") ?? "").trim();

  if (!name) return { error: "Company name is required.", ok: false };
  if (!adminName) return { error: "Admin name is required.", ok: false };
  if (!adminEmail) return { error: "Admin email is required.", ok: false };
  if (adminPassword.length < 8) {
    return { error: "Admin password must be at least 8 characters.", ok: false };
  }
  if (!isValidPin(adminPin)) {
    return {
      error: "Admin PIN must be 4 to 6 digits. The POS unlocks with this PIN, not the dashboard password.",
      ok: false,
    };
  }

  try {
    const company = await apiCreateCompany(client, {
      name,
      adminName,
      adminEmail,
      adminPassword,
    });
    await bootstrapCompanyAdmin(company.id, adminPassword, adminPin);
  } catch (error) {
    return { error: errorMessage(error), ok: false };
  }

  revalidatePath("/platform");
  redirect("/platform" as Route);
}

/**
 * Creating a user under a company the superadmin has not "opened" for
 * navigation needs a one-off scoped token (POST /users relies on
 * company.context, which only resolves from the token) — issued and used
 * here without touching the caller's own session/acting-company cookie.
 */
export async function addCompanyAdmin(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { client } = await requireSuperadmin();

  const companyId = String(formData.get("company_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const pin = String(formData.get("pin") ?? "").trim();

  if (!companyId) return { error: "Missing company.", ok: false };
  if (!name) return { error: "Name is required.", ok: false };
  if (!email) return { error: "Email is required.", ok: false };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", ok: false };
  }
  if (pin && !isValidPin(pin)) {
    return { error: "PIN must be 4 to 6 digits.", ok: false };
  }

  try {
    const opened = await apiOpenCompany(client, companyId);
    const scoped = createScopedClient(opened.token);

    const admin = await createUser(scoped, { name, email, role: "admin", password });
    // Forces must_change_password = true — see bootstrapCompanyAdmin.
    await resetUserPassword(scoped, admin.id, password);
    if (pin) await resetUserPin(scoped, admin.id, pin);
  } catch (error) {
    return { error: errorMessage(error), ok: false };
  }

  revalidatePath(`/platform/companies/${companyId}`);
  revalidatePath("/platform");
  return { error: null, ok: true };
}

export async function setCompanyActive(formData: FormData): Promise<void> {
  const { client } = await requireSuperadmin();
  const companyId = String(formData.get("company_id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!companyId) return;

  await updateCompany(client, companyId, { isActive });

  revalidatePath("/platform");
  revalidatePath(`/platform/companies/${companyId}`);
}

export async function setInvoiceMode(formData: FormData): Promise<void> {
  const { client } = await requireSuperadmin();
  const companyId = String(formData.get("company_id") ?? "");
  const mode = String(formData.get("mode") ?? "");
  if (!companyId || (mode !== "incremental" && mode !== "random")) return;

  await setCompanyInvoiceMode(client, companyId, mode);

  revalidatePath(`/platform/companies/${companyId}`);
}

export async function openCompany(formData: FormData): Promise<void> {
  const { client } = await requireSuperadmin();
  const companyId = String(formData.get("company_id") ?? "");
  if (!companyId) return;

  const opened = await apiOpenCompany(client, companyId);
  await setActingSession(opened.token, { id: opened.company.id, name: opened.company.name });

  redirect("/");
}

export async function exitCompany(): Promise<void> {
  await requireSuperadmin();
  await exitActingSession();
  redirect("/platform" as Route);
}

export async function resetCompanyUserPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { client } = await requireSuperadmin();

  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  // resetUserPassword always forces must_change_password = true server-side —
  // the old "leave it false" option (mustChangePassword=false in the form)
  // has no Tally API equivalent; the checkbox is dropped, always-true is the
  // safer default for a superadmin-initiated reset anyway.
  const companyId = String(formData.get("company_id") ?? "");

  if (!id) return { error: "Missing user.", ok: false };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", ok: false };
  }

  try {
    await resetUserPassword(client, id, password);
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      return { error: "Cannot reset another superadmin.", ok: false };
    }
    return { error: errorMessage(error), ok: false };
  }

  if (companyId) revalidatePath(`/platform/companies/${companyId}`);
  return { error: null, ok: true };
}

/**
 * Toggles `users.is_demo` — the access code itself is generated by a
 * separate site; this is only the flag deciding which account it gates.
 */
export async function setCompanyUserDemoFlag(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { client } = await requireSuperadmin();

  const id = String(formData.get("id") ?? "");
  const isDemo = formData.get("is_demo") === "true";
  const companyId = String(formData.get("company_id") ?? "");

  if (!id) return { error: "Missing user.", ok: false };

  try {
    await setUserDemoFlag(client, id, isDemo);
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      return { error: "Cannot flag a superadmin as demo.", ok: false };
    }
    return { error: errorMessage(error), ok: false };
  }

  if (companyId) revalidatePath(`/platform/companies/${companyId}`);
  return { error: null, ok: true };
}

export async function resetCompanyUserPin(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { client } = await requireSuperadmin();

  const id = String(formData.get("id") ?? "");
  const pin = String(formData.get("pin") ?? "").trim();
  const companyId = String(formData.get("company_id") ?? "");

  if (!id) return { error: "Missing user.", ok: false };
  if (!isValidPin(pin)) {
    return { error: "The PIN must be 4 to 6 digits.", ok: false };
  }

  try {
    await resetUserPin(client, id, pin);
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      return { error: "Cannot reset another superadmin.", ok: false };
    }
    return { error: errorMessage(error), ok: false };
  }

  if (companyId) revalidatePath(`/platform/companies/${companyId}`);
  return { error: null, ok: true };
}
