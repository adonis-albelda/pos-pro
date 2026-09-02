"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { countProductsByCategory, createCategory, listCategories } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useCategories(options: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.categories.list(options),
    queryFn: () => listCategories(getBrowserApiClient(), options),
  });
}

export function useCategoryProductCounts(options: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.categories.productCounts(options),
    queryFn: () => countProductsByCategory(getBrowserApiClient(), options),
  });
}

/** Call after saveCategory/toggleCategoryActive/removeCategory (Server Actions) succeed — revalidatePath doesn't touch this cache. */
export function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createCategory>[1]) =>
      createCategory(getBrowserApiClient(), input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
    },
  });
}
