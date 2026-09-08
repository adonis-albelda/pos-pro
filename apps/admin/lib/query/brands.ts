"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBrand, listBrands } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useBrands() {
  return useQuery({
    queryKey: queryKeys.brands.list(),
    queryFn: () => listBrands(getBrowserApiClient()),
  });
}

export function useCreateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createBrand>[1]) => createBrand(getBrowserApiClient(), input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.brands.all });
    },
  });
}
