"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCatalogSettings, updateCatalogSettings } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useCatalogSettings() {
  return useQuery({
    queryKey: queryKeys.catalogSettings.detail(),
    queryFn: () => getCatalogSettings(getBrowserApiClient()),
    staleTime: 60_000,
  });
}

export function useUpdateCatalogSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variantSignalDetectionEnabled: boolean) =>
      updateCatalogSettings(getBrowserApiClient(), variantSignalDetectionEnabled),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.catalogSettings.detail(), settings);
    },
  });
}
