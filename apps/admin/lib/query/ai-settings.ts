"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCompanyAiSettings, updateCompanyAiSettings } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useAiSettings() {
  return useQuery({
    queryKey: queryKeys.aiSettings.detail(),
    queryFn: () => getCompanyAiSettings(getBrowserApiClient()),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateCompanyAiSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => updateCompanyAiSettings(getBrowserApiClient(), enabled),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.aiSettings.detail(), settings);
    },
  });
}
