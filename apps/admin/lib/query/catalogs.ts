"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { listCatalogsPage } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export const READY_CATALOG_PAGE_SIZE = 20;

/** Infinite pages of ready-catalog categories for a store type. */
export function useReadyCatalogCategories(storeType: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.readyCatalogs.list(storeType),
    queryFn: ({ pageParam }) =>
      listCatalogsPage(getBrowserApiClient(), {
        storeType,
        page: pageParam,
        pageSize: READY_CATALOG_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length < lastPage.lastPage ? allPages.length + 1 : undefined,
    enabled: Boolean(storeType),
    staleTime: 5 * 60 * 1000,
  });
}
