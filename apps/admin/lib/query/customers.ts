"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customerBalance,
  getCustomer,
  listCustomerBalances,
  listCustomerOpenSales,
  listCustomerPayments,
  listCustomers,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useCustomers() {
  return useQuery({
    queryKey: queryKeys.customers.list(),
    queryFn: () => listCustomers(getBrowserApiClient()),
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id),
    queryFn: () => getCustomer(getBrowserApiClient(), id),
    enabled: Boolean(id),
  });
}

export function useCustomerBalance(id: string) {
  return useQuery({
    queryKey: queryKeys.customers.balance(id),
    queryFn: () => customerBalance(getBrowserApiClient(), id),
    enabled: Boolean(id),
  });
}

/**
 * Every customer's utang balance in one map, for the list page's "Balance
 * owed" column — one real grouped endpoint server-side
 * (`GET /customers/credit/outstanding`), not the N-parallel-calls pattern
 * `listSupplierBalances` uses. Kept under the `customers.all` prefix (not a
 * per-id `balance(id)` key) so useInvalidateCustomers() still evicts it,
 * mirroring suppliers.ts's `useSupplierBalances`.
 */
export function useCustomerBalances() {
  return useQuery({
    queryKey: [...queryKeys.customers.all, "balances"] as const,
    queryFn: () => listCustomerBalances(getBrowserApiClient()),
  });
}

/** FIFO preview only — which of a customer's credit sales are still open. */
export function useCustomerOpenSales(id: string) {
  return useQuery({
    queryKey: [...queryKeys.customers.detail(id), "open-sales"] as const,
    queryFn: () => listCustomerOpenSales(getBrowserApiClient(), id),
    enabled: Boolean(id),
  });
}

export function useCustomerPayments(id: string) {
  return useQuery({
    queryKey: [...queryKeys.customers.detail(id), "payments"] as const,
    queryFn: () => listCustomerPayments(getBrowserApiClient(), id),
    enabled: Boolean(id),
  });
}

/** Call after saveCustomer/removeCustomer (Server Actions) succeed — revalidatePath doesn't touch this cache. */
export function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
}
