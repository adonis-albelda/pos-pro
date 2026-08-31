import type { ApiClient, JsonApiPage, JsonApiResource } from "../http";
import { appendMultipartField, appendMultipartFile, type MultipartFile } from "../multipart";

export interface GalleryPhoto {
  id: string;
  label: string;
  photoUrl: string;
  status: "pending" | "processed";
  locationId: string | null;
  locationName: string | null;
  uploadedBy: string | null;
  goodsReceiptId: string | null;
  processedAt: string | null;
  createdAt: string;
}

interface GalleryPhotoAttrs {
  label: string;
  photo_url: string;
  status: "pending" | "processed";
  location_id: string | null;
  location_name: string | null;
  uploaded_by: string | null;
  goods_receipt_id: string | null;
  processed_at: string | null;
  created_at: string | null;
}

function toGalleryPhoto(resource: JsonApiResource<GalleryPhotoAttrs>): GalleryPhoto {
  const a = resource.attributes;
  return {
    id: resource.id,
    label: a.label,
    photoUrl: a.photo_url,
    status: a.status,
    locationId: a.location_id,
    locationName: a.location_name,
    uploadedBy: a.uploaded_by,
    goodsReceiptId: a.goods_receipt_id,
    processedAt: a.processed_at,
    createdAt: a.created_at ?? "",
  };
}

/** "Process it later" queue — a delivery photo parked here instead of sent through Messenger. */
export async function listGalleryPhotos(
  client: ApiClient,
  options: { status?: "pending" | "processed" } = {},
): Promise<GalleryPhoto[]> {
  const page = await client.get<JsonApiPage<GalleryPhotoAttrs>>("/gallery-photos", {
    status: options.status,
  });
  return page.data.map(toGalleryPhoto);
}

export async function uploadGalleryPhoto(
  client: ApiClient,
  input: { photo: MultipartFile; label?: string | null; locationId?: string | null },
): Promise<GalleryPhoto> {
  const formData = new FormData();
  await appendMultipartFile(formData, "photo", input.photo);
  if (input.label) appendMultipartField(formData, "label", input.label);
  if (input.locationId) appendMultipartField(formData, "location_id", input.locationId);

  const { data } = await client.postMultipart<{ data: JsonApiResource<GalleryPhotoAttrs> }>(
    "/gallery-photos",
    formData,
  );
  return toGalleryPhoto(data);
}

export async function deleteGalleryPhoto(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/gallery-photos/${id}`);
}
