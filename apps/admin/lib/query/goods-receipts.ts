"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGoodsReceipt,
  listGoodsReceipts,
  type GoodsReceiptsFilter,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useGoodsReceipts(filter: GoodsReceiptsFilter = {}) {
  return useQuery({
    queryKey: queryKeys.goodsReceipts.list(filter as Record<string, unknown>),
    queryFn: () => listGoodsReceipts(getBrowserApiClient(), filter),
  });
}

export function useGoodsReceipt(id: string) {
  return useQuery({
    queryKey: queryKeys.goodsReceipts.detail(id),
    queryFn: () => getGoodsReceipt(getBrowserApiClient(), id),
    enabled: Boolean(id),
  });
}

/**
 * Call after createGoodsReceiptAction succeeds — receiving a PO-linked
 * delivery also changes the PO itself (status, quantity_received, the
 * "Stock effect" movements card) and stock/inventory, so both cache
 * namespaces need to drop too.
 */
export function useInvalidateGoodsReceipts() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.goodsReceipts.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
  };
}
