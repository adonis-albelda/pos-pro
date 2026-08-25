"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@double-a/api-client";
import { createCategory, deleteCategory, updateCategory } from "@double-a/api-client/queries";
import type { FormState } from "@/lib/form-state";
import { getAuthedClient } from "@/lib/api/session";

/**
 * Renaming or re-parenting rewrites the flattened path on every product
 * underneath, which the database does in a trigger — so the products page and
 * the terminals are revalidated alongside this one.
 */
function revalidateCategoryViews() {
  revalidatePath("/categories");
  revalidatePath("/products");
  revalidatePath("/reports");
}

/**
 * The Laravel API rejects a duplicate sibling name and a circular parent the
 * same way: a 422 with a `parent_id`/`name` validation message attached
 * (`StoreCategoryRequest`/`UpdateCategoryRequest`'s `uniqueSiblingName()`
 * closure, and `CategoryPathService::assertNoCycle()` via
 * `ValidationException::withMessages()`). Both already read as friendly
 * sentences, so surface them directly instead of matching Postgres
 * constraint names, which no longer appear now that Supabase is gone.
 */
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isValidation && error.errors) {
      const messages = Object.values(error.errors).flat();
      if (messages.length > 0) return messages.join(" ");
    }
    if (error.isForbidden) return error.message;
    return `Could not save the category: ${error.message}`;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return `Could not save the category: ${message}`;
}

export async function saveCategory(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const parentId = String(formData.get("parent_id") ?? "").trim() || null;
  const markupPercent = Number(formData.get("markup_percent") ?? 0);
  const markupApplied = formData.get("markup_applied") === "true";

  if (!name) return { error: "Give the category a name.", ok: false };
  if (id && parentId === id) {
    return { error: "A category cannot be its own parent.", ok: false };
  }
  if (!Number.isFinite(markupPercent) || markupPercent < 0) {
    return { error: "Markup percent must be zero or more.", ok: false };
  }

  const client = getAuthedClient();

  const patch = {
    name,
    parentId,
    markupPercent,
    markupApplied,
  };

  try {
    if (id) {
      await updateCategory(client, id, patch);
    } else {
      await createCategory(client, patch);
    }
  } catch (error) {
    return { error: describeError(error), ok: false };
  }

  revalidateCategoryViews();
  return { error: null, ok: true };
}

export async function toggleCategoryActive(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";

  const client = getAuthedClient();
  await updateCategory(client, id, { isActive });

  revalidateCategoryViews();
}

/**
 * Deleting takes every category nested underneath with it. Products keep the
 * category text already printed on their receipts and simply lose the link.
 */
export async function removeCategory(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");

  const client = getAuthedClient();
  await deleteCategory(client, id);

  revalidateCategoryViews();
}
