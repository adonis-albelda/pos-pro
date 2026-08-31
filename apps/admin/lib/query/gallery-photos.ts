"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteGalleryPhoto, listGalleryPhotos, uploadGalleryPhoto } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";

const GALLERY_PHOTOS_KEY = ["gallery-photos"] as const;

/** "Process it later" queue — pending by default. */
export function useGalleryPhotos(options: { status?: "pending" | "processed" } = {}) {
  return useQuery({
    queryKey: [...GALLERY_PHOTOS_KEY, options.status ?? "pending"] as const,
    queryFn: () => listGalleryPhotos(getBrowserApiClient(), { status: options.status ?? "pending" }),
  });
}

export function useUploadGalleryPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { photo: File; label?: string | null; locationId?: string | null }) =>
      uploadGalleryPhoto(getBrowserApiClient(), input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GALLERY_PHOTOS_KEY });
    },
  });
}

export function useDeleteGalleryPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteGalleryPhoto(getBrowserApiClient(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GALLERY_PHOTOS_KEY });
    },
  });
}

export function useInvalidateGalleryPhotos() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: GALLERY_PHOTOS_KEY });
}
