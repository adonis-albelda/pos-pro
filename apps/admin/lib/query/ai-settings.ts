"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCompanyAiSettings } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useAiSettings() {
  return useQuery({
    queryKey: queryKeys.aiSettings.detail(),
    queryFn: () => getCompanyAiSettings(getBrowserApiClient()),
    staleTime: 30_000,
  });
}

export function useInvalidateAiSettings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.aiSettings.all });
}
