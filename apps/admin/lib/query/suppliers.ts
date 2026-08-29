"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listProducts,
  listSupplierBalances,
  listSupplierProducts,
  listSuppliers,
  getSupplier,
  supplierBalance,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useSuppliers(options: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.suppliers.list(options),
    queryFn: () => listSuppliers(getBrowserApiClient(), options),
  });
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: queryKeys.suppliers.detail(id),
    queryFn: () => getSupplier(getBrowserApiClient(), id),
    enabled: Boolean(id),
  });
}

export function useSupplierBalance(id: string) {
  return useQuery({
    queryKey: queryKeys.suppliers.balance(id),
    queryFn: () => supplierBalance(getBrowserApiClient(), id),
    enabled: Boolean(id),
  });
}

/**
 * Every supplier's balance in one map, for the list page's "Balance owed"
 * column (suppliers-panel.tsx). Not one of keys.ts's per-id `balance(id)`
 * entries — kept under the `suppliers.all` prefix instead of a new top-level
 * key so useInvalidateSuppliers() still evicts it.
 */
export function useSupplierBalances() {
  return useQuery({
    queryKey: [...queryKeys.suppliers.all, "balances"] as const,
    queryFn: () => listSupplierBalances(getBrowserApiClient()),
  });
}

/**
 * Flat, unpaginated product list backing the supplier-product picker
 * (supplier-form.tsx) on both the list and detail pages. Deliberately not
 * `queryKeys.products.list(...)` — that key belongs to the products domain's
 * own paginated `useProducts` (lib/query/products.ts) and returns a
 * different shape; reusing it here would corrupt that cache. Same
 * cross-domain-read-kept-in-the-calling-domain's-file precedent as
 * categories.ts's `useCategoryProductCounts`. Note this has no
 * cross-invalidation with the products domain's own mutations — a product
 * renamed/added elsewhere won't refresh this list until it naturally goes
 * stale or a supplier mutation invalidates the `suppliers.all` prefix.
 */
export function useSupplierProductOptions(enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.suppliers.all, "product-options"] as const,
    queryFn: () => listProducts(getBrowserApiClient(), { includeInactive: true }),
    enabled,
  });
}

/** What this supplier is actually linked to right now — pre-checks the products picker instead of opening blank. */
export function useSupplierProducts(supplierId: string, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.suppliers.detail(supplierId), "products"] as const,
    queryFn: () => listSupplierProducts(getBrowserApiClient(), supplierId),
    enabled: enabled && Boolean(supplierId),
  });
}

/** Call after saveSupplier/removeSupplier (Server Actions) succeed — revalidatePath doesn't touch this cache. */
export function useInvalidateSuppliers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
}
