"use client";

import { useQuery } from "@tanstack/react-query";
import {
  reportByCashier,
  reportByDevice,
  reportDeadStock,
  reportDiscounts,
  reportInventoryValuation,
  reportInventoryValuationSummary,
  reportProfit,
  reportTopProducts,
  type DateRange,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

/**
 * One hook per `packages/api-client/src/queries/reports.ts` function, all
 * read-only (no invalidate hook — nothing on this page ever writes). Each is
 * keyed on its own params (range/limit/days) so the Reports page's
 * URL-driven date range keeps a separate cache entry per range instead of
 * refetching from scratch every time the user flips back to a range they've
 * already seen this session.
 */

export function useReportProfit(range: DateRange) {
  return useQuery({
    queryKey: queryKeys.reports.profit({ ...range }),
    queryFn: () => reportProfit(getBrowserApiClient(), range),
  });
}

export function useReportTopProducts(range: DateRange, limit = 20) {
  return useQuery({
    queryKey: queryKeys.reports.topProducts({ ...range }, limit),
    queryFn: () => reportTopProducts(getBrowserApiClient(), range, limit),
  });
}

export function useReportDiscounts(range: DateRange) {
  return useQuery({
    queryKey: queryKeys.reports.discounts({ ...range }),
    queryFn: () => reportDiscounts(getBrowserApiClient(), range),
  });
}

export function useReportByCashier(range: DateRange) {
  return useQuery({
    queryKey: queryKeys.reports.byCashier({ ...range }),
    queryFn: () => reportByCashier(getBrowserApiClient(), range),
  });
}

export function useReportByDevice(range: DateRange) {
  return useQuery({
    queryKey: queryKeys.reports.byDevice({ ...range }),
    queryFn: () => reportByDevice(getBrowserApiClient(), range),
  });
}

/** No date range — a snapshot of what's on the shelves right now. */
export function useReportInventoryValuation() {
  return useQuery({
    queryKey: queryKeys.reports.inventoryValuation(),
    queryFn: () => reportInventoryValuation(getBrowserApiClient()),
  });
}

/** Grouped by category — what the reports page's Stock value chart reads instead of the full per-product list. */
export function useReportInventoryValuationSummary() {
  return useQuery({
    queryKey: [...queryKeys.reports.inventoryValuation(), "summary"] as const,
    queryFn: () => reportInventoryValuationSummary(getBrowserApiClient()),
  });
}

export function useReportDeadStock(days = 60) {
  return useQuery({
    queryKey: queryKeys.reports.deadStock(days),
    queryFn: () => reportDeadStock(getBrowserApiClient(), days),
  });
}
