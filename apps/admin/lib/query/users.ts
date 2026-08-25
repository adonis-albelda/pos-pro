"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { countUsers, listUsers, updateUser } from "@double-a/api-client/queries";
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

/** Call after saveCashier (Server Action) succeeds — revalidatePath doesn't touch this cache. */
export function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
}

/**
 * Client-side, not a Server Action — a toggle needs its error (e.g. the
 * demo-account 403) to reach a toast directly, which a Server Action
 * crashing into Next's generic error boundary never did.
 */
export function useToggleUserCanSell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, canSell }: { id: string; canSell: boolean }) =>
      updateUser(getBrowserApiClient(), id, { canSell }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
