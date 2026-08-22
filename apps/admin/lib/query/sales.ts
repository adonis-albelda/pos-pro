"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSale, listMovementsPage, listSales, listSalesPage } from "@double-a/api-client/queries";
import type { SaleWithItems } from "@double-a/shared-types";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

/**
 * GAP: IndexSalesController only accepts customer_id/status (see
 * queries/sales.ts) — from/to/userId/deviceId filters are applied
 * client-side by walking paginated listSalesPage results, capped, exactly
 * as sales/page.tsx used to do as a Server Component. Cashier-name joins
 * stay the caller's job (useUsers()), same as before.
 */
const SALES_SCAN_CAP = 2000;

export interface SalesListFilter {
  from?: string;
  to?: string;
  userId?: string;
  deviceId?: string;
  status?: string;
}

export function useSalesList(filter: SalesListFilter = {}) {
  return useQuery({
    queryKey: queryKeys.sales.list({ ...filter }),
    queryFn: () => scanSales(filter),
  });
}

async function scanSales(filter: SalesListFilter): Promise<SaleWithItems[]> {
  const client = getBrowserApiClient();
  const from = filter.from ? new Date(filter.from).toISOString() : undefined;
  const to = filter.to ? new Date(`${filter.to}T23:59:59`).toISOString() : undefined;

  const sales: SaleWithItems[] = [];
  let scanned = 0;
  for (let apiPage = 1; scanned < SALES_SCAN_CAP; apiPage += 1) {
    const result = await listSalesPage(client, {
      status: filter.status || undefined,
      page: apiPage,
      pageSize: 200,
    });
    scanned += result.sales.length;
    sales.push(
      ...result.sales.filter((sale) => {
        if (from && sale.createdAt < from) return false;
        if (to && sale.createdAt > to) return false;
        if (filter.userId && sale.userId !== filter.userId) return false;
        if (filter.deviceId && sale.deviceId !== filter.deviceId) return false;
        return true;
      }),
    );
    if (apiPage >= result.lastPage || sales.length >= 300) break;
  }
  return sales;
}

/**
 * Single most-recent-N fetch, no date filter server-side — the dashboard's
 * own GAP comment (app/(dashboard)/page.tsx) filters to today client-side on
 * top of this. Not namespaced through queryKeys.sales.list() (that shape is
 * useSalesList's filter object) so the two never collide in cache.
 */
export function useRecentSales(limit = 200) {
  return useQuery({
    queryKey: ["sales", "recent", limit] as const,
    queryFn: () => listSales(getBrowserApiClient(), { limit }),
  });
}

export function useSale(id: string) {
  return useQuery({
    queryKey: queryKeys.sales.detail(id),
    queryFn: () => getSale(getBrowserApiClient(), id),
    enabled: Boolean(id),
  });
}

/**
 * `IndexInventoryMovementsController` filters on `reference_id` server-side
 * (indexed column) — one request, not a shop-wide scan. Used to walk every
 * page of recent movements looking for this sale's, which made the sale
 * detail page slow for any shop with real movement history.
 *
 * Key is namespaced under "sales" (not "inventory") so
 * useInvalidateSales() below catches it too — voiding a sale changes both
 * the sale and its movements.
 */
export function useSaleMovements(saleId: string) {
  return useQuery({
    queryKey: ["sales", "detail", saleId, "movements"] as const,
    queryFn: async () => {
      const result = await listMovementsPage(getBrowserApiClient(), {
        referenceId: saleId,
        pageSize: 200,
      });
      return result.movements.filter((m) => m.reason === "sale" || m.reason === "void_restore");
    },
    enabled: Boolean(saleId),
  });
}

/** Call after voidSaleAction/patchSaleFlagsAction (Server Actions) succeed — revalidatePath doesn't touch this cache. */
export function useInvalidateSales() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
}
