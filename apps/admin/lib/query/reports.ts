"use client";

import { useQuery } from "@tanstack/react-query";
import {
  reportByCashier,
  reportByCategory,
  reportByDevice,
  reportByLocation,
  reportByPaymentMethod,
  reportDeadStock,
  reportDiscountsPage,
  reportInventoryValuation,
  reportInventoryValuationSummary,
  reportProfit,
  reportRefundsVoids,
  reportTopProducts,
  type DateRange,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

const REPORTS_STALE_MS = 60_000;

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
    staleTime: REPORTS_STALE_MS,
  });
}

export function useReportTopProducts(range: DateRange, limit = 20) {
  return useQuery({
    queryKey: queryKeys.reports.topProducts({ ...range }, limit),
    queryFn: () => reportTopProducts(getBrowserApiClient(), range, limit),
    staleTime: REPORTS_STALE_MS,
  });
}

export function useReportDiscounts(range: DateRange, page = 1, pageSize = 15) {
  return useQuery({
    queryKey: queryKeys.reports.discounts({ ...range }, page),
    queryFn: () => reportDiscountsPage(getBrowserApiClient(), range, { page, pageSize }),
    staleTime: REPORTS_STALE_MS,
    placeholderData: (previous) => previous,
  });
}

export function useReportByCashier(range: DateRange) {
  return useQuery({
    queryKey: queryKeys.reports.byCashier({ ...range }),
    queryFn: () => reportByCashier(getBrowserApiClient(), range),
    staleTime: REPORTS_STALE_MS,
  });
}

export function useReportByDevice(range: DateRange) {
  return useQuery({
    queryKey: queryKeys.reports.byDevice({ ...range }),
    queryFn: () => reportByDevice(getBrowserApiClient(), range),
    staleTime: REPORTS_STALE_MS,
  });
}

export function useReportByCategory(range: DateRange) {
  return useQuery({
    queryKey: queryKeys.reports.byCategory({ ...range }),
    queryFn: () => reportByCategory(getBrowserApiClient(), range),
    staleTime: REPORTS_STALE_MS,
  });
}

export function useReportByPaymentMethod(range: DateRange) {
  return useQuery({
    queryKey: queryKeys.reports.byPaymentMethod({ ...range }),
    queryFn: () => reportByPaymentMethod(getBrowserApiClient(), range),
    staleTime: REPORTS_STALE_MS,
  });
}

export function useReportByLocation(range: DateRange) {
  return useQuery({
    queryKey: queryKeys.reports.byLocation({ ...range }),
    queryFn: () => reportByLocation(getBrowserApiClient(), range),
    staleTime: REPORTS_STALE_MS,
  });
}

export function useReportRefundsVoids(range: DateRange) {
  return useQuery({
    queryKey: queryKeys.reports.refundsVoids({ ...range }),
    queryFn: () => reportRefundsVoids(getBrowserApiClient(), range),
    staleTime: REPORTS_STALE_MS,
  });
}

/** No date range — a snapshot of what's on the shelves right now. */
export function useReportInventoryValuation() {
  return useQuery({
    queryKey: queryKeys.reports.inventoryValuation(),
    queryFn: () => reportInventoryValuation(getBrowserApiClient()),
    staleTime: REPORTS_STALE_MS,
  });
}

/** Grouped by category — what the reports page's Stock value chart reads instead of the full per-product list. */
export function useReportInventoryValuationSummary() {
  return useQuery({
    queryKey: [...queryKeys.reports.inventoryValuation(), "summary"] as const,
    queryFn: () => reportInventoryValuationSummary(getBrowserApiClient()),
    staleTime: REPORTS_STALE_MS,
  });
}

export function useReportDeadStock(days = 60) {
  return useQuery({
    queryKey: queryKeys.reports.deadStock(days),
    queryFn: () => reportDeadStock(getBrowserApiClient(), days),
    staleTime: REPORTS_STALE_MS,
  });
}
