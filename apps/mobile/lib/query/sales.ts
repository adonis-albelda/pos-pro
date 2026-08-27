import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSale, listSalesPage, type SalesFilter } from "@double-a/api-client/queries";
import { getAdminApiClient } from "@/lib/api/session";
import { queryKeys } from "./keys";

/**
 * Read + void + flag-patch only — sales are never created from an admin
 * screen (CLAUDE.md rule 3: the mobile POS sync push flow is the only
 * writer, with client-generated UUIDs).
 */
export function useSalesList(filter: SalesFilter = {}) {
  return useQuery({
    queryKey: queryKeys.sales.list({ ...filter }),
    queryFn: () => listSalesPage(getAdminApiClient(), filter),
  });
}

export function useSale(id: string) {
  return useQuery({
    queryKey: queryKeys.sales.detail(id),
    queryFn: () => getSale(getAdminApiClient(), id),
    enabled: Boolean(id),
  });
}

/** Call after voidSale/patchSaleFlags succeed. */
export function useInvalidateSales() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
}
