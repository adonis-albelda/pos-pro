"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPlatformAiSettings } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function usePlatformAiSettings() {
  return useQuery({
    queryKey: queryKeys.platformAiSettings.detail(),
    queryFn: () => getPlatformAiSettings(getBrowserApiClient()),
    staleTime: 30_000,
  });
}

export function useInvalidatePlatformAiSettings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.platformAiSettings.all });
}
