"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { countUsers, listUsers } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

/** Backs the Users page itself, and also read cross-domain for cashier-name lookups (sales, purchase-orders, etc). */
export function useUsers(options: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.users.list(options),
    queryFn: () => listUsers(getBrowserApiClient(), options),
  });
}

/** "Users on file" on the menu page's System Information card — a count query, not the full list. */
export function useUserCount() {
  return useQuery({
    queryKey: [...queryKeys.users.all, "count"] as const,
    queryFn: () => countUsers(getBrowserApiClient()),
  });
}

/** Call after saveCashier/toggleUserCanSell/toggleCashierActive (Server Actions) succeed — revalidatePath doesn't touch this cache. */
export function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
}
