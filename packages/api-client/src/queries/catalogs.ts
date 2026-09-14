import type { ApiClient, JsonApiPage, JsonApiResource } from "../http";

/** One product line inside a ready-catalog category row. */
export interface ReadyCatalogProduct {
  name: string;
  variants: string[];
}

/**
 * One DB row = one category from the source JSON
 * (`{ category, products: [...] }`).
 */
export interface ReadyCatalogCategory {
  id: string;
  storeType: string;
  /** Pack label, e.g. "Supermarket starter". */
  name: string | null;
  category: string;
  products: ReadyCatalogProduct[];
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
}

interface CatalogAttrs {
  store_type: string;
  name: string | null;
  category: string;
  products: ReadyCatalogProduct[];
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
}

function toCategory(resource: JsonApiResource<CatalogAttrs>): ReadyCatalogCategory {
  const a = resource.attributes;
  return {
    id: resource.id,
    storeType: a.store_type,
    name: a.name,
    category: a.category,
    products: a.products ?? [],
    sortOrder: a.sort_order,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

export interface ListCatalogsPageOptions {
  storeType?: string | null;
  page?: number;
  /** Default 20 — matches admin infinite-scroll page size. */
  pageSize?: number;
}

export interface ListCatalogsPageResult {
  categories: ReadyCatalogCategory[];
  total: number;
  lastPage: number;
  currentPage: number;
}

/** Paginated category rows for a store type. */
export async function listCatalogsPage(
  client: ApiClient,
  options: ListCatalogsPageOptions = {},
): Promise<ListCatalogsPageResult> {
  const page = await client.get<JsonApiPage<CatalogAttrs>>("/catalogs", {
    store_type: options.storeType || undefined,
    page: options.page ?? 1,
    per_page: options.pageSize ?? 20,
  });

  return {
    categories: page.data.map(toCategory),
    total: page.meta?.total ?? page.data.length,
    lastPage: page.meta?.last_page ?? 1,
    currentPage: page.meta?.current_page ?? options.page ?? 1,
  };
}

/** One category row by id. */
export async function getCatalog(client: ApiClient, id: string): Promise<ReadyCatalogCategory> {
  const { data } = await client.get<{ data: JsonApiResource<CatalogAttrs> }>(`/catalogs/${id}`);
  return toCategory(data);
}
