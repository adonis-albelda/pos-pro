"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  countProducts,
  getProductStats,
  listBelowReorder,
  listProductLabelsPage,
  listProductsPage,
  setProductActive,
  type ListProductsPageOptions,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

/**
 * Wraps listProductsPage's own "if the requested page is past the end,
 * re-fetch the last valid page" correction (the same two-step logic
 * products/page.tsx used to do inline as a Server Component) so callers
 * always get a page that actually has rows on it, without a second useQuery.
 */
export function useProducts(options: ListProductsPageOptions = {}) {
  return useQuery({
    queryKey: queryKeys.products.list({ ...options }),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const client = getBrowserApiClient();
      const pageSize = options.pageSize ?? 25;
      const first = await listProductsPage(client, options);
      const pageCount = Math.max(1, Math.ceil(first.total / pageSize));
      const requestedPage = options.page ?? 1;
      const safePage = Math.min(requestedPage, pageCount);

      if (safePage === requestedPage || first.total === 0) {
        return { ...first, page: safePage, pageCount };
      }

      const corrected = await listProductsPage(client, { ...options, page: safePage });
      return { ...corrected, page: safePage, pageCount };
    },
  });
}

/** The Inventory page's four header stat cards — one aggregate query, not a whole-catalogue walk. */
export function useProductStats() {
  return useQuery({
    queryKey: [...queryKeys.products.all, "stats"] as const,
    queryFn: () => getProductStats(getBrowserApiClient()),
  });
}

/** Total product count — used by launcher/summary pages that just need a number, not the rows. */
export function useProductCount(options: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.products.count(options),
    queryFn: () => countProducts(getBrowserApiClient(), options),
  });
}

/** Lean, paginated, searchable id/sku/name/category picker for the Product QR/barcode label sheet. */
export function useProductLabelsPage(
  options: { q?: string; categoryId?: string; page?: number; pageSize?: number } = {},
) {
  return useQuery({
    queryKey: [...queryKeys.products.all, "labels", options] as const,
    placeholderData: keepPreviousData,
    queryFn: () => listProductLabelsPage(getBrowserApiClient(), options),
  });
}

/** Products at or below their own reorder point — the Reports "Reorder list" and dashboard's low-stock card. */
export function useBelowReorder() {
  return useQuery({
    queryKey: queryKeys.products.belowReorder(),
    queryFn: () => listBelowReorder(getBrowserApiClient()),
  });
}

/** Call after saveProduct (Server Action) succeeds — revalidatePath doesn't touch this cache. */
export function useInvalidateProducts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
}

/**
 * Client-side, not a Server Action — a toggle needs its error (e.g. the
 * demo-account 403) to reach a toast directly, which a Server Action
 * crashing into Next's generic error boundary never did.
 */
export function useSetProductActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setProductActive(getBrowserApiClient(), id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}
