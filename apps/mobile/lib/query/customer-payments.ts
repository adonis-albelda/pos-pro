import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customerBalance,
  listCustomerBalances,
  listCustomerOpenSales,
  listCustomerPayments,
} from "@double-a/api-client/queries";
import { getAdminApiClient } from "@/lib/api/session";
import { queryKeys } from "./keys";

/**
 * Live-only, like every other admin-tab mutation on mobile (PaymentTermRow,
 * markPaymentPaid) — a ledger balance must never be computed from a
 * possibly-stale local SQLite snapshot, so this always calls the API
 * directly rather than reading through db/.
 */
export function useCustomerBalance(customerId: string) {
  return useQuery({
    queryKey: queryKeys.customers.balance(customerId),
    queryFn: () => customerBalance(getAdminApiClient(), customerId),
    enabled: Boolean(customerId),
  });
}

/** Every customer who currently owes utang, for the list screen's "Balance owed" column. */
export function useCustomerBalances() {
  return useQuery({
    queryKey: [...queryKeys.customers.all, "balances"] as const,
    queryFn: () => listCustomerBalances(getAdminApiClient()),
  });
}

/** FIFO preview only — which of a customer's credit sales are still open. */
export function useCustomerOpenSales(customerId: string) {
  return useQuery({
    queryKey: [...queryKeys.customers.detail(customerId), "open-sales"] as const,
    queryFn: () => listCustomerOpenSales(getAdminApiClient(), customerId),
    enabled: Boolean(customerId),
  });
}

export function useCustomerPayments(customerId: string) {
  return useQuery({
    queryKey: [...queryKeys.customers.detail(customerId), "payments"] as const,
    queryFn: () => listCustomerPayments(getAdminApiClient(), customerId),
    enabled: Boolean(customerId),
  });
}

/** Call after recordCustomerPayment succeeds. */
export function useInvalidateCustomerCredit(customerId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(customerId) });
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.customers.all, "balances"] });
  };
}
