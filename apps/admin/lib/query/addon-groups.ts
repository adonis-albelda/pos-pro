"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addAddonGroupItem,
  createAddonGroup,
  deleteAddonGroup,
  deleteAddonGroupItem,
  deleteAddonGroupItemPhoto,
  linkProductAddonGroup,
  listAddonGroups,
  listProductAddonGroups,
  unlinkProductAddonGroup,
  updateAddonGroup,
  uploadAddonGroupItemPhoto,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useAddonGroups() {
  return useQuery({
    queryKey: queryKeys.addonGroups.list(),
    queryFn: () => listAddonGroups(getBrowserApiClient()),
  });
}

export function useCreateAddonGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createAddonGroup>[1]) => createAddonGroup(getBrowserApiClient(), input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addonGroups.all });
    },
  });
}

export function useUpdateAddonGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Parameters<typeof updateAddonGroup>[2]) =>
      updateAddonGroup(getBrowserApiClient(), id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addonGroups.all });
    },
  });
}

export function useDeleteAddonGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAddonGroup(getBrowserApiClient(), id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addonGroups.all });
    },
  });
}

export function useAddAddonGroupItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, ...input }: { groupId: string } & Parameters<typeof addAddonGroupItem>[2]) =>
      addAddonGroupItem(getBrowserApiClient(), groupId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addonGroups.all });
    },
  });
}

export function useDeleteAddonGroupItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteAddonGroupItem(getBrowserApiClient(), itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addonGroups.all });
    },
  });
}

export function useUploadAddonGroupItemPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, photo }: { itemId: string; photo: File }) =>
      uploadAddonGroupItemPhoto(getBrowserApiClient(), itemId, photo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addonGroups.all });
    },
  });
}

export function useDeleteAddonGroupItemPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteAddonGroupItemPhoto(getBrowserApiClient(), itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.addonGroups.all });
    },
  });
}

export function useProductAddonGroups(productId: string | null) {
  return useQuery({
    queryKey: ["products", "addon-groups", productId],
    queryFn: () => listProductAddonGroups(getBrowserApiClient(), productId as string),
    enabled: productId !== null,
  });
}

export function useLinkProductAddonGroup(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (addonGroupId: string) => linkProductAddonGroup(getBrowserApiClient(), productId, addonGroupId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", "addon-groups", productId] });
    },
  });
}

export function useUnlinkProductAddonGroup(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (addonGroupId: string) => unlinkProductAddonGroup(getBrowserApiClient(), productId, addonGroupId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", "addon-groups", productId] });
    },
  });
}
