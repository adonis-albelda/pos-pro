import type { ApiClient, JsonApiResource } from "../http";

export interface Unit {
  id: string;
  name: string;
  abbreviation: string | null;
  isPlatformDefault: boolean;
}

interface UnitAttrs {
  name: string;
  abbreviation: string | null;
  is_platform_default: boolean;
}

function toUnit(resource: JsonApiResource<UnitAttrs>): Unit {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    abbreviation: a.abbreviation,
    isPlatformDefault: a.is_platform_default,
  };
}

/** Platform-wide defaults plus this company's own custom units. */
export async function listUnits(client: ApiClient): Promise<Unit[]> {
  const { data } = await client.get<{ data: JsonApiResource<UnitAttrs>[] }>("/units");
  return data.map(toUnit);
}

export async function createUnit(
  client: ApiClient,
  input: { name: string; abbreviation?: string | null },
): Promise<Unit> {
  const { data } = await client.post<{ data: JsonApiResource<UnitAttrs> }>("/units", {
    name: input.name,
    abbreviation: input.abbreviation,
  });
  return toUnit(data);
}

/** Only works on a company's own custom unit — platform defaults reject this with a 403. */
export async function updateUnit(
  client: ApiClient,
  id: string,
  patch: Partial<{ name: string; abbreviation: string | null }>,
): Promise<Unit> {
  const { data } = await client.patch<{ data: JsonApiResource<UnitAttrs> }>(`/units/${id}`, patch);
  return toUnit(data);
}

/** Only works on a company's own custom, unassigned unit — 403 for a platform default, 422 if a variant still uses it. */
export async function deleteUnit(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/units/${id}`);
}
