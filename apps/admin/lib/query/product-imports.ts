"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProductImportStatus,
  listProductImports,
  rollbackProductImport,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useProductImportHistory(options: { page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.productImports.list({ ...options }),
    queryFn: () => listProductImports(getBrowserApiClient(), options),
  });
}

/** Same shape a fresh import's own progress poller uses — reused for rollback progress too. */
export function useProductImportStatus(importId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.productImports.detail(importId ?? ""),
    queryFn: () => getProductImportStatus(getBrowserApiClient(), importId as string),
    enabled: Boolean(importId) && (options.enabled ?? true),
  });
}

export function useRollbackProductImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (importId: string) => rollbackProductImport(getBrowserApiClient(), importId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.productImports.all });
    },
  });
}
