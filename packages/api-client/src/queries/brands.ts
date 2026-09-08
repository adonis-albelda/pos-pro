import type { ApiClient, JsonApiResource } from "../http";

export interface Brand {
  id: string;
  name: string;
}

interface BrandAttrs {
  name: string;
}

function toBrand(resource: JsonApiResource<BrandAttrs>): Brand {
  return { id: resource.id, name: resource.attributes.name };
}

export async function listBrands(client: ApiClient): Promise<Brand[]> {
  const { data } = await client.get<{ data: JsonApiResource<BrandAttrs>[] }>("/brands");
  return data.map(toBrand);
}

export async function createBrand(client: ApiClient, input: { name: string }): Promise<Brand> {
  const { data } = await client.post<{ data: JsonApiResource<BrandAttrs> }>("/brands", { name: input.name });
  return toBrand(data);
}
