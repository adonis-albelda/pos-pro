import type { ApiClient, JsonApiResource } from "../http";

export interface Tag {
  id: string;
  name: string;
}

interface TagAttrs {
  name: string;
}

function toTag(resource: JsonApiResource<TagAttrs>): Tag {
  return { id: resource.id, name: resource.attributes.name };
}

export async function listTags(client: ApiClient): Promise<Tag[]> {
  const { data } = await client.get<{ data: JsonApiResource<TagAttrs>[] }>("/tags");
  return data.map(toTag);
}

export async function createTag(client: ApiClient, input: { name: string }): Promise<Tag> {
  const { data } = await client.post<{ data: JsonApiResource<TagAttrs> }>("/tags", { name: input.name });
  return toTag(data);
}

export async function attachProductTag(client: ApiClient, productId: string, tagId: string): Promise<void> {
  await client.post(`/products/${productId}/tags`, { tag_id: tagId });
}

export async function detachProductTag(client: ApiClient, productId: string, tagId: string): Promise<void> {
  await client.delete(`/products/${productId}/tags/${tagId}`);
}
