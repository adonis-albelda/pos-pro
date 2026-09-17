import type { Category, CategoryType } from "@double-a/shared-types";
import { ApiError, type ApiClient, type JsonApiResource } from "../http";
import { type CategoryAttrs, toCategory } from "../mappers";

/**
 * `buildCategoryTree` / `flattenCategoryTree` (flat rows -> `CategoryNode[]`)
 * are pure client-side computation with no API dependency — they stay out of
 * api-client. They currently live in
 * `packages/supabase/src/queries/categories.ts` (used by
 * `apps/admin/lib/category-options.ts`) and should move to a plain util
 * (e.g. `@double-a/shared-types`) rather than be re-ported here when the
 * supabase package is retired.
 */

export interface CategoryInput {
  name: string;
  parentId?: string | null;
  categoryType?: CategoryType;
  isActive?: boolean;
  markupPercent?: number;
  markupApplied?: boolean;
}

function toPayload(input: Partial<CategoryInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.parentId !== undefined) payload.parent_id = input.parentId;
  if (input.categoryType !== undefined) payload.category_type = input.categoryType;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  if (input.markupPercent !== undefined) payload.markup_percent = input.markupPercent;
  if (input.markupApplied !== undefined) payload.markup_applied = input.markupApplied;
  return payload;
}

/**
 * Every category the office keeps. Also what a mobile pull takes down whole:
 * the table is small, and fetching it whole is the only way a device learns a
 * category was deleted, since an incremental query returns nothing for a row
 * that no longer exists.
 *
 * `IndexCategoriesController` takes no filter query params — it always
 * returns the full company tree, ordered by name. The old Postgres query's
 * `includeInactive` option therefore filters client-side here rather than on
 * the request.
 */
export async function listCategories(
  client: ApiClient,
  options: { includeInactive?: boolean; categoryType?: CategoryType } = {},
): Promise<Category[]> {
  const { data } = await client.get<{ data: JsonApiResource<CategoryAttrs>[] }>("/categories", {
    type: options.categoryType,
  });
  const categories = data.map(toCategory);
  return options.includeInactive ? categories : categories.filter((c) => c.isActive);
}

export async function getCategory(client: ApiClient, id: string): Promise<Category | null> {
  try {
    const { data } = await client.get<{ data: JsonApiResource<CategoryAttrs> }>(`/categories/${id}`);
    return toCategory(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function createCategory(client: ApiClient, input: CategoryInput): Promise<Category> {
  const { data } = await client.post<{ data: JsonApiResource<CategoryAttrs> }>(
    "/categories",
    toPayload(input),
  );
  return toCategory(data);
}

export async function updateCategory(
  client: ApiClient,
  id: string,
  patch: Partial<CategoryInput>,
): Promise<Category> {
  const { data } = await client.patch<{ data: JsonApiResource<CategoryAttrs> }>(
    `/categories/${id}`,
    toPayload(patch),
  );
  return toCategory(data);
}

/**
 * Deleting cascades to child categories server-side; products under them keep
 * their flattened path text and simply lose the link, so nothing on a receipt
 * or in a past report changes.
 */
export async function deleteCategory(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/categories/${id}`);
}
