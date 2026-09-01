"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  findProductIdsMatching,
  listMovementsPage,
  listOversold,
  listProducts,
  sumMovements,
  type MovementFilter,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { useInvalidateProducts } from "@/lib/query/products";
import { queryKeys } from "./keys";

/**
 * Whole catalogue, same "load everything, filter/sort/paginate client-side"
 * contract the inventory Server Component used for both tabs (header stats
 * and the Stock on hand table). Keyed under "products" (not "inventory") so
 * a product edit elsewhere in the app — via useInvalidateProducts() —
 * invalidates this too; the underlying data is products, this page is just
 * one more reader of it.
 */
export function useInventoryProducts(
  options: { includeInactive?: boolean; enabled?: boolean; locationId?: string } = {},
) {
  const { enabled = true, ...listOptions } = options;
  return useQuery({
    queryKey: ["products", "catalogue", listOptions] as const,
    queryFn: () => listProducts(getBrowserApiClient(), listOptions),
    enabled,
  });
}

export function useInventoryMovements(
  filter: MovementFilter & { page?: number; pageSize?: number },
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.inventory.movements(filter as Record<string, unknown>),
    placeholderData: keepPreviousData,
    queryFn: () => listMovementsPage(getBrowserApiClient(), filter),
    enabled: options.enabled ?? true,
  });
}

/** Stock in / stock out / net across every movement matching the filter — the four stat cards atop the Movement history tab. */
export function useMovementTotals(filter: MovementFilter, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["inventory", "movements", filter, "totals"] as const,
    queryFn: () => sumMovements(getBrowserApiClient(), filter),
    enabled: options.enabled ?? true,
  });
}

/**
 * A name search reaches inventory_movements through product ids — the table
 * itself holds no product name. Keyed under "products" for the same reason
 * as useInventoryProducts above.
 */
export function useProductIdsMatching(q: string, options: { includeInactive?: boolean } = {}) {
  const needle = q.trim();
  return useQuery({
    queryKey: ["products", "search-ids", needle, options] as const,
    queryFn: () => findProductIdsMatching(getBrowserApiClient(), needle, options),
    enabled: needle.length > 0,
  });
}

/** Negative stock after an offline oversell — the dashboard's "Oversold after sync" card. */
export function useOversoldProducts() {
  return useQuery({
    queryKey: queryKeys.inventory.oversold(),
    queryFn: () => listOversold(getBrowserApiClient()),
  });
}

/**
 * Call after moveStock (Server Action) succeeds — revalidatePath doesn't
 * touch this cache. A stock movement changes products.stock_quantity too
 * (via the apply_inventory_movement() trigger), so this also invalidates
 * the products domain — otherwise the Products list/detail pages would keep
 * showing the pre-adjustment quantity until their own next refetch.
 */
export function useInvalidateInventory() {
  const queryClient = useQueryClient();
  const invalidateProducts = useInvalidateProducts();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    invalidateProducts();
  };
}
