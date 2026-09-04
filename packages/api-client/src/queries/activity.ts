import { type ApiClient, type JsonApiPage, type JsonApiResource } from "../http";

/**
 * One spatie/laravel-activitylog row — an audit entry for a create/update/
 * delete on Product, Category, Supplier, or GoodsReceipt (the 4 models this
 * app logs), or read back per-user across all of them.
 */
export interface Activity {
  id: string;
  event: string | null;
  description: string;
  subjectType: string | null;
  subjectId: string | null;
  causerId: string | null;
  causerName: string | null;
  /** Attribute values before/after — only populated for the 'updated' event. */
  changes: {
    old: Record<string, unknown> | null;
    attributes: Record<string, unknown> | null;
  };
  createdAt: string;
}

interface ActivityAttrs {
  event: string | null;
  description: string;
  subject_type: string | null;
  subject_id: string | null;
  causer_id: string | null;
  causer_name: string | null;
  changes: {
    old: Record<string, unknown> | null;
    attributes: Record<string, unknown> | null;
  };
  created_at: string;
}

function toActivity(resource: JsonApiResource<ActivityAttrs>): Activity {
  const attrs = resource.attributes;
  return {
    id: resource.id,
    event: attrs.event,
    description: attrs.description,
    subjectType: attrs.subject_type,
    subjectId: attrs.subject_id,
    causerId: attrs.causer_id,
    causerName: attrs.causer_name,
    changes: attrs.changes,
    createdAt: attrs.created_at,
  };
}

async function fetchActivity(client: ApiClient, path: string): Promise<Activity[]> {
  const page = await client.get<JsonApiPage<ActivityAttrs>>(path, { per_page: 50 });
  return page.data.map(toActivity);
}

export function getProductActivity(client: ApiClient, productId: string): Promise<Activity[]> {
  return fetchActivity(client, `/products/${productId}/activity`);
}

export function getCategoryActivity(client: ApiClient, categoryId: string): Promise<Activity[]> {
  return fetchActivity(client, `/categories/${categoryId}/activity`);
}

export function getSupplierActivity(client: ApiClient, supplierId: string): Promise<Activity[]> {
  return fetchActivity(client, `/suppliers/${supplierId}/activity`);
}

export function getGoodsReceiptActivity(
  client: ApiClient,
  goodsReceiptId: string,
): Promise<Activity[]> {
  return fetchActivity(client, `/goods-receipts/${goodsReceiptId}/activity`);
}

export function getUserActivity(client: ApiClient, userId: string): Promise<Activity[]> {
  return fetchActivity(client, `/users/${userId}/activity`);
}
