"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  embedAllProducts,
  getPlatformAiSettings,
  getProductEmbeddingCoverage,
  updatePlatformAiSettings,
} from "@double-a/api-client/queries";
import type { AiPlanId } from "@double-a/shared-types";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useProductEmbeddingCoverage() {
  return useQuery({
    queryKey: queryKeys.productEmbeddingCoverage.detail(),
    queryFn: () => getProductEmbeddingCoverage(getBrowserApiClient()),
  });
}

export function useEmbedAllProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => embedAllProducts(getBrowserApiClient()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.productEmbeddingCoverage.all });
    },
  });
}

export function usePlatformAiSettings() {
  return useQuery({
    queryKey: queryKeys.platformAiSettings.detail(),
    queryFn: () => getPlatformAiSettings(getBrowserApiClient()),
    staleTime: 5 * 60_000,
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
