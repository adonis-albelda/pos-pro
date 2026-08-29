"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelEmbedAllBatch,
  embedAllProducts,
  getEmbedAllBatchStatus,
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
  return useMutation({
    mutationFn: () => embedAllProducts(getBrowserApiClient()),
  });
}

/** Polls a running backfill batch every 1.5s until it finishes or is cancelled. */
export function useEmbedAllBatchStatus(batchId: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.productEmbeddingCoverage.batch(batchId),
    queryFn: () => getEmbedAllBatchStatus(getBrowserApiClient(), batchId!),
    enabled: batchId !== null,
    refetchInterval: (query) => {
      const status = query.state.data;
      if (!status || status.finished || status.cancelled) {
        // Coverage % only moves once jobs actually finish — refresh it here
        // rather than making every caller remember to.
        void queryClient.invalidateQueries({ queryKey: queryKeys.productEmbeddingCoverage.detail() });
        return false;
      }
      return 1500;
    },
  });
}

export function useCancelEmbedAllBatch() {
  return useMutation({
    mutationFn: (batchId: string) => cancelEmbedAllBatch(getBrowserApiClient(), batchId),
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
