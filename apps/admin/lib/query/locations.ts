"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LocationType } from "@double-a/shared-types";
import { listLocations, listStockTransfers } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useLocations(options: { type?: LocationType; includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.locations.list(options),
    queryFn: () => listLocations(getBrowserApiClient(), options),
  });
}

export function useStockTransfers(options: { status?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.locations.transfers(options),
    queryFn: () => listStockTransfers(getBrowserApiClient(), {
      status: options.status as "pending" | "in_transit" | "received" | "cancelled" | undefined,
    }),
  });
}

export function useInvalidateLocations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.locations.all });
}
