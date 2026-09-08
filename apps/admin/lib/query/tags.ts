"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { attachProductTag, createTag, detachProductTag, listTags } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useTags() {
  return useQuery({
    queryKey: queryKeys.tags.list(),
    queryFn: () => listTags(getBrowserApiClient()),
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createTag>[1]) => createTag(getBrowserApiClient(), input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
    },
  });
}

export function useAttachProductTag(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => attachProductTag(getBrowserApiClient(), productId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useDetachProductTag(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => detachProductTag(getBrowserApiClient(), productId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}
