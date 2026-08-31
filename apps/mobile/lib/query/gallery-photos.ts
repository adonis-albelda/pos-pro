import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteGalleryPhoto, listGalleryPhotos, uploadGalleryPhoto } from "@double-a/api-client/queries";
import { getAdminApiClient } from "@/lib/api/session";

const GALLERY_PHOTOS_KEY = ["gallery-photos"] as const;

/** "Process it later" queue — pending by default, the only state the receiving screen's picker shows. */
export function useGalleryPhotos(options: { status?: "pending" | "processed" } = {}) {
  return useQuery({
    queryKey: [...GALLERY_PHOTOS_KEY, options.status ?? "pending"] as const,
    queryFn: () => listGalleryPhotos(getAdminApiClient(), { status: options.status ?? "pending" }),
  });
}

export function useUploadGalleryPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { photo: File; label?: string | null; locationId?: string | null }) =>
      uploadGalleryPhoto(getAdminApiClient(), input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GALLERY_PHOTOS_KEY });
    },
  });
}

export function useDeleteGalleryPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteGalleryPhoto(getAdminApiClient(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GALLERY_PHOTOS_KEY });
    },
  });
}
