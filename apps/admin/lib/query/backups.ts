"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listDatabaseBackups, type DatabaseBackup } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export type { DatabaseBackup };

export function useDatabaseBackups() {
  return useQuery({
    queryKey: queryKeys.backups.list(),
    queryFn: () => listDatabaseBackups(getBrowserApiClient()),
    refetchInterval: (current) => {
      const rows = current.state.data ?? [];
      return rows.some((row) => row.status === "running" || row.status === "pending") ? 3000 : false;
    },
  });
}

export function useInvalidateDatabaseBackups() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.backups.all });
}
