"use client";

import { useQuery } from "@tanstack/react-query";
import { getCatalog, listCatalogs } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

/** Summaries for a store type — enabled only when a type is chosen. */
export function useReadyCatalogs(storeType: string | null) {
  return useQuery({
    queryKey: queryKeys.readyCatalogs.list(storeType),
    queryFn: () => listCatalogs(getBrowserApiClient(), storeType),
    enabled: Boolean(storeType),
    staleTime: 5 * 60 * 1000,
  });
}

/** Full products tree for one ready catalog. */
export function useReadyCatalog(id: string | null) {
  return useQuery({
    queryKey: queryKeys.readyCatalogs.detail(id ?? ""),
    queryFn: () => getCatalog(getBrowserApiClient(), id!),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
  });
}
