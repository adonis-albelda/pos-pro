"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getPlatformAiSettings, updatePlatformAiSettings } from "@double-a/api-client/queries";
import type { AiPlanId } from "@double-a/shared-types";
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

export function useUpdatePlatformAiSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: {
      photoOverageChargePeso: number;
      plans: Array<{
        id: AiPlanId;
        name?: string;
        photoExtractWeeklyLimit: number;
        vectorSearchWeeklyLimit: number;
      }>;
    }) => updatePlatformAiSettings(getBrowserApiClient(), settings),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.platformAiSettings.detail(), settings);
    },
  });
}
