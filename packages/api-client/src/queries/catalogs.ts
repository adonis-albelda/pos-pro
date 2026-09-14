import type { ApiClient, JsonApiResource } from "../http";

/** One product line inside a ready-catalog category. */
export interface ReadyCatalogProduct {
  name: string;
  variants: string[];
}

/** Category block: accordion unit on the Ready Catalog page. */
export interface ReadyCatalogCategory {
  category: string;
  products: ReadyCatalogProduct[];
}

/** List row — no products payload (heavy JSON stays on show). */
export interface ReadyCatalogSummary {
  id: string;
  storeType: string;
  name: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Full ready catalog including the products tree. */
export interface ReadyCatalog extends ReadyCatalogSummary {
  products: ReadyCatalogCategory[];
}

interface CatalogAttrs {
  store_type: string;
  name: string | null;
  products?: ReadyCatalogCategory[];
  created_at: string | null;
  updated_at: string | null;
}

function toSummary(resource: JsonApiResource<CatalogAttrs>): ReadyCatalogSummary {
  const a = resource.attributes;
  return {
    id: resource.id,
    storeType: a.store_type,
    name: a.name,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

function toCatalog(resource: JsonApiResource<CatalogAttrs>): ReadyCatalog {
  const a = resource.attributes;
  return {
    ...toSummary(resource),
    products: a.products ?? [],
  };
}

/** Platform-global ready catalogs, optionally filtered by store_type. */
export async function listCatalogs(
  client: ApiClient,
  storeType?: string | null,
): Promise<ReadyCatalogSummary[]> {
  const { data } = await client.get<{ data: JsonApiResource<CatalogAttrs>[] }>("/catalogs", {
    store_type: storeType || undefined,
  });
  return data.map(toSummary);
}

/** One ready catalog with the full products JSON tree. */
export async function getCatalog(client: ApiClient, id: string): Promise<ReadyCatalog> {
  const { data } = await client.get<{ data: JsonApiResource<CatalogAttrs> }>(`/catalogs/${id}`);
  return toCatalog(data);
}
