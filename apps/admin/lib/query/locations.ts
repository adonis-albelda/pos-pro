"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LocationType } from "@double-a/shared-types";
import {
  getStockTransfer,
  listLocations,
  listStockTransfers,
  type StockTransfersFilter,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useLocations(options: { type?: LocationType; includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.locations.list(options),
    queryFn: () => listLocations(getBrowserApiClient(), options),
  });
}

export function useStockTransfers(options: StockTransfersFilter = {}) {
  return useQuery({
    queryKey: queryKeys.locations.transfers(options as Record<string, unknown>),
    placeholderData: keepPreviousData,
    queryFn: () => listStockTransfers(getBrowserApiClient(), options),
  });
}

export function useStockTransfer(id: string) {
  return useQuery({
    queryKey: [...queryKeys.locations.all, "transfer", id] as const,
    queryFn: () => getStockTransfer(getBrowserApiClient(), id),
    enabled: Boolean(id),
  });
}

export function useInvalidateLocations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
}
