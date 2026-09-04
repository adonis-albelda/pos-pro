"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addGoodsReceiptPayment,
  createGoodsReceipt,
  extractGoodsReceiptPhoto,
  getGoodsReceipt,
  listGoodsReceipts,
  updateGoodsReceipt,
  updateGoodsReceiptPayment,
  type CreateGoodsReceiptInput,
  type GoodsReceiptsFilter,
  type UpdateGoodsReceiptInput,
} from "@double-a/api-client/queries";
import type { MultipartFile } from "@double-a/api-client";
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
 * Call after a receipt is created — receiving a PO-linked delivery also
 * changes the PO itself (status, quantity_received, the "Stock effect"
 * movements card) and stock/inventory, so both cache namespaces need to
 * drop too.
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

/**
 * Direct client call, no Server Action in between — the receiving form
 * used to round-trip this through a `"use server"` action that re-parsed
 * the JSON as a differently-cased type, which is exactly what caused a
 * silent field-dropping bug. One hop: component -> api-client -> Laravel.
 */
export function useExtractGoodsReceiptPhoto() {
  return useMutation({
    mutationFn: (input: { photo: MultipartFile; purchaseOrderId?: string | null }) =>
      extractGoodsReceiptPhoto(getBrowserApiClient(), input.photo, input.purchaseOrderId),
  });
}

export function useCreateGoodsReceipt() {
  const invalidate = useInvalidateGoodsReceipts();
  return useMutation({
    mutationFn: (input: CreateGoodsReceiptInput) => createGoodsReceipt(getBrowserApiClient(), input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateGoodsReceipt(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateGoodsReceiptInput) => updateGoodsReceipt(getBrowserApiClient(), id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.goodsReceipts.detail(id) });
    },
  });
}

export function useAddGoodsReceiptPayment(goodsReceiptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof addGoodsReceiptPayment>[2]) =>
      addGoodsReceiptPayment(getBrowserApiClient(), goodsReceiptId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.goodsReceipts.detail(goodsReceiptId) });
    },
  });
}

export function useUpdateGoodsReceiptPayment(goodsReceiptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, ...input }: { paymentId: string } & Parameters<typeof updateGoodsReceiptPayment>[2]) =>
      updateGoodsReceiptPayment(getBrowserApiClient(), paymentId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.goodsReceipts.detail(goodsReceiptId) });
    },
  });
}
