"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getCategoryActivity,
  getGoodsReceiptActivity,
  getProductActivity,
  getSupplierActivity,
  getUserActivity,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useProductActivity(productId: string) {
  return useQuery({
    queryKey: queryKeys.activity.product(productId),
    queryFn: () => getProductActivity(getBrowserApiClient(), productId),
  });
}

export function useCategoryActivity(categoryId: string) {
  return useQuery({
    queryKey: queryKeys.activity.category(categoryId),
    queryFn: () => getCategoryActivity(getBrowserApiClient(), categoryId),
  });
}

export function useSupplierActivity(supplierId: string) {
  return useQuery({
    queryKey: queryKeys.activity.supplier(supplierId),
    queryFn: () => getSupplierActivity(getBrowserApiClient(), supplierId),
  });
}

export function useGoodsReceiptActivity(goodsReceiptId: string) {
  return useQuery({
    queryKey: queryKeys.activity.goodsReceipt(goodsReceiptId),
    queryFn: () => getGoodsReceiptActivity(getBrowserApiClient(), goodsReceiptId),
  });
}

/** Enabled lazily — only fetch when a user's activity dialog is actually open. */
export function useUserActivity(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.activity.user(userId),
    queryFn: () => getUserActivity(getBrowserApiClient(), userId),
    enabled,
  });
}
