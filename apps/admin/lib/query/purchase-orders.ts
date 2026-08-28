"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InventoryMovement } from "@double-a/shared-types";
import {
  countOpenPurchaseOrders,
  getPurchaseOrder,
  listMovementsPage,
  listPurchaseOrders,
  listUpcomingSupplierPayments,
  sumSupplierBalance,
  type PurchaseOrdersFilter,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

/** Single-page fetch (up to 200), same as the Server Component this replaced — paginated client-side. */
export function usePurchaseOrders(filter: PurchaseOrdersFilter & { limit?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.list(filter as Record<string, unknown>),
    placeholderData: keepPreviousData,
    queryFn: () => listPurchaseOrders(getBrowserApiClient(), filter),
  });
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.detail(id),
    queryFn: () => getPurchaseOrder(getBrowserApiClient(), id),
    enabled: Boolean(id),
  });
}

export function useUpcomingSupplierPayments(days?: number) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.upcomingPayments(),
    queryFn: () => listUpcomingSupplierPayments(getBrowserApiClient(), days),
  });
}

/** Count of orders in "ordered" or "partially_received" status — the dashboard's "Open purchase orders" card. */
export function useOpenPurchaseOrdersCount() {
  return useQuery({
    queryKey: ["purchase-orders", "open-count"] as const,
    queryFn: () => countOpenPurchaseOrders(getBrowserApiClient()),
  });
}

/** Unpaid installment total across every open (non-cancelled) purchase order — the dashboard's "Supplier balance" card. */
export function useSupplierBalanceTotal() {
  return useQuery({
    queryKey: ["purchase-orders", "balance"] as const,
    queryFn: () => sumSupplierBalance(getBrowserApiClient()),
  });
}

/**
 * IndexInventoryMovementsController does support `reference_id` — one
 * filtered call, not a shop-wide page walk. `reason` isn't a server filter,
 * but a purchase order's own reference_id already scopes this to a handful
 * of rows, so filtering "restock" out of that tiny set client-side is cheap.
 * Key is namespaced under "purchase-orders" (not "inventory") so
 * useInvalidatePurchaseOrders() below catches it too — receiving a line
 * changes both the PO and its movements.
 */
export function usePurchaseOrderMovements(purchaseOrderId: string) {
  return useQuery({
    queryKey: ["purchase-orders", "detail", purchaseOrderId, "movements"] as const,
    queryFn: async () => {
      const result = await listMovementsPage(getBrowserApiClient(), {
        referenceId: purchaseOrderId,
        pageSize: 200,
      });
      return result.movements.filter((m: InventoryMovement) => m.reason === "restock");
    },
    enabled: Boolean(purchaseOrderId),
  });
}

/**
 * Call after receivePurchaseOrderItemAction/markPaymentPaidAction/
 * markPaymentUnpaidAction/updatePurchaseOrderStatusAction (Server Actions)
 * succeed — revalidatePath doesn't touch this cache.
 */
export function useInvalidatePurchaseOrders() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
}
