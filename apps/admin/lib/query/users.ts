"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  countUsers,
  createUser,
  deleteUser,
  getUser,
  listUsers,
  sendUserEmailVerification,
  updateUser,
  type CreateUserInput,
  type UpdateUserInput,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

/** Backs the Users page itself, and also read cross-domain for cashier-name lookups (sales, purchase-orders, etc). */
export function useUsers(options: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.users.list(options),
    queryFn: () => listUsers(getBrowserApiClient(), options),
  });
}

/**
 * Single user with Spatie permissions — used by Access after the directory
 * list stopped shipping perms (GET /users was timing out on Spatie pivots).
 */
export function useUser(id: string | null) {
  return useQuery({
    queryKey: queryKeys.users.detail(id ?? ""),
    queryFn: () => getUser(getBrowserApiClient(), id!),
    enabled: Boolean(id),
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

export function useResendUserEmailVerification() {
  return useMutation({
    mutationFn: (id: string) => sendUserEmailVerification(getBrowserApiClient(), id),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(getBrowserApiClient(), input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateUserInput }) =>
      updateUser(getBrowserApiClient(), id, patch),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(id) });
    },
  });
}

/** Soft delete — User uses SoftDeletes server-side; deleted_at excludes it from every later listUsers() read. */
export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUser(getBrowserApiClient(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
