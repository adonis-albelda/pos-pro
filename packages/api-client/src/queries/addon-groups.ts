import type { ApiClient, JsonApiResource } from "../http";
import { appendMultipartFile, type MultipartFile } from "../multipart";

export interface AddonGroupItem {
  id: string;
  variantId: string;
  productName: string | null;
  variantLabel: string | null;
  extraPrice: number | null;
  effectivePrice: number;
  photoUrl: string | null;
}

export interface AddonGroup {
  id: string;
  name: string;
  selectionType: "single" | "multiple";
  isRequired: boolean;
  items: AddonGroupItem[];
}

interface AddonGroupAttrs {
  name: string;
  selection_type: string;
  is_required: boolean;
  items: {
    id: string;
    variant_id: string;
    product_name: string | null;
    variant_label: string | null;
    extra_price: number | null;
    effective_price: number;
    photo_url: string | null;
  }[];
}

function toAddonGroup(resource: JsonApiResource<AddonGroupAttrs>): AddonGroup {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    selectionType: a.selection_type as AddonGroup["selectionType"],
    isRequired: a.is_required,
    items: (a.items ?? []).map((item) => ({
      id: item.id,
      variantId: item.variant_id,
      productName: item.product_name,
      variantLabel: item.variant_label,
      extraPrice: item.extra_price,
      effectivePrice: item.effective_price,
      photoUrl: item.photo_url,
    })),
  };
}

export async function listAddonGroups(client: ApiClient): Promise<AddonGroup[]> {
  const { data } = await client.get<{ data: JsonApiResource<AddonGroupAttrs>[] }>("/addon-groups");
  return data.map(toAddonGroup);
}

export async function createAddonGroup(
  client: ApiClient,
  input: { name: string; selectionType?: AddonGroup["selectionType"]; isRequired?: boolean },
): Promise<AddonGroup> {
  const { data } = await client.post<{ data: JsonApiResource<AddonGroupAttrs> }>("/addon-groups", {
    name: input.name,
    selection_type: input.selectionType,
    is_required: input.isRequired,
  });
  return toAddonGroup(data);
}

export async function updateAddonGroup(
  client: ApiClient,
  id: string,
  patch: Partial<{ name: string; selectionType: AddonGroup["selectionType"]; isRequired: boolean }>,
): Promise<AddonGroup> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.selectionType !== undefined) payload.selection_type = patch.selectionType;
  if (patch.isRequired !== undefined) payload.is_required = patch.isRequired;

  const { data } = await client.patch<{ data: JsonApiResource<AddonGroupAttrs> }>(`/addon-groups/${id}`, payload);
  return toAddonGroup(data);
}

export async function deleteAddonGroup(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/addon-groups/${id}`);
}

export async function addAddonGroupItem(
  client: ApiClient,
  groupId: string,
  input: { variantId: string; extraPrice?: number | null },
): Promise<AddonGroup> {
  const { data } = await client.post<{ data: JsonApiResource<AddonGroupAttrs> }>(`/addon-groups/${groupId}/items`, {
    variant_id: input.variantId,
    extra_price: input.extraPrice,
  });
  return toAddonGroup(data);
}

export async function deleteAddonGroupItem(client: ApiClient, itemId: string): Promise<void> {
  await client.delete(`/addon-group-items/${itemId}`);
}

/** Server resizes to a mobile-friendly size and re-encodes as WebP — same pipeline as a product photo. */
export async function uploadAddonGroupItemPhoto(
  client: ApiClient,
  itemId: string,
  photo: MultipartFile,
): Promise<AddonGroup> {
  const formData = new FormData();
  await appendMultipartFile(formData, "photo", photo);
  const { data } = await client.postMultipart<{ data: JsonApiResource<AddonGroupAttrs> }>(
    `/addon-group-items/${itemId}/photo`,
    formData,
  );
  return toAddonGroup(data);
}

export async function deleteAddonGroupItemPhoto(client: ApiClient, itemId: string): Promise<AddonGroup> {
  const { data } = await client.delete<{ data: JsonApiResource<AddonGroupAttrs> }>(
    `/addon-group-items/${itemId}/photo`,
  );
  return toAddonGroup(data);
}

export async function listProductAddonGroups(client: ApiClient, productId: string): Promise<AddonGroup[]> {
  const { data } = await client.get<{ data: JsonApiResource<AddonGroupAttrs>[] }>(
    `/products/${productId}/addon-groups`,
  );
  return data.map(toAddonGroup);
}

export async function linkProductAddonGroup(client: ApiClient, productId: string, addonGroupId: string): Promise<void> {
  await client.post(`/products/${productId}/addon-groups`, { addon_group_id: addonGroupId });
}

export async function unlinkProductAddonGroup(client: ApiClient, productId: string, addonGroupId: string): Promise<void> {
  await client.delete(`/products/${productId}/addon-groups/${addonGroupId}`);
}
