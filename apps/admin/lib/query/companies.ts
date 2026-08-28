"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { AiPlanId, CompanyStats, InvoiceNumberMode } from "@double-a/shared-types";
import {
  companyStats,
  listCompanyUsers,
  listDemoAccessCodes,
  setCompanyInvoiceMode,
  updateCompany,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

function patchCompanyStatsRow(
  queryClient: QueryClient,
  companyId: string,
  patch: Partial<CompanyStats>,
): void {
  queryClient.setQueryData<CompanyStats[]>(queryKeys.companies.stats(), (current) => {
    if (!current) return current;
    return current.map((row) => (row.id === companyId ? { ...row, ...patch } : row));
  });
}

/**
 * Superadmin-only (CLAUDE.md §15) platform read — every company's row, no
 * `company_id` scoping. `refetchOnMount: "always"` overrides the app's 30s
 * default staleTime deliberately: `createCompany` (Server Action) redirects
 * back to /platform on success, and a Server Action calling `redirect()`
 * never gives client code a reliable place to call an invalidate hook (the
 * awaited call throws the NEXT_REDIRECT digest instead of resolving with a
 * success state) — see lib/query/companies.ts's caller-side notes in the
 * platform pages. Always refetching on mount is the simple, correct fix:
 * this list is small and infrequently visited.
 */
export function useCompanyStats() {
  return useQuery({
    queryKey: queryKeys.companies.stats(),
    queryFn: () => companyStats(getBrowserApiClient()),
    refetchOnMount: "always",
  });
}

/** Call after setCompanyActive (Server Action) succeeds — revalidatePath doesn't touch this cache. */
export function useInvalidateCompanyStats() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats() }),
    [queryClient],
  );
}

/**
 * Superadmin company-detail user list via GET /superadmin/companies/:id/users —
 * no openCompany scoped token on the client.
 */
export function useCompanyUsers(companyId: string) {
  return useQuery({
    queryKey: queryKeys.companies.users(companyId),
    queryFn: () => listCompanyUsers(getBrowserApiClient(), companyId, { includeInactive: true }),
    refetchOnMount: "always",
  });
}

/** Call after add/reset company-user Server Actions succeed. */
export function useInvalidateCompanyUsers(companyId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.companies.users(companyId) }),
    [queryClient, companyId],
  );
}

export function useSetCompanyActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, isActive }: { companyId: string; isActive: boolean }) =>
      updateCompany(getBrowserApiClient(), companyId, { isActive }),
    onSuccess: (company) => {
      patchCompanyStatsRow(queryClient, company.id, { isActive: company.isActive });
    },
  });
}

export function useSetCompanyAiPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, aiPlanId }: { companyId: string; aiPlanId: AiPlanId }) =>
      updateCompany(getBrowserApiClient(), companyId, { aiPlanId }),
    onSuccess: (company) => {
      patchCompanyStatsRow(queryClient, company.id, { aiPlanId: company.aiPlanId });
    },
  });
}

export function useSetCompanyInvoiceMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, mode }: { companyId: string; mode: InvoiceNumberMode }) =>
      setCompanyInvoiceMode(getBrowserApiClient(), companyId, mode),
    onSuccess: (mode, { companyId }) => {
      patchCompanyStatsRow(queryClient, companyId, { invoiceNumberMode: mode });
    },
  });
}

/** Every demo@store.com access code issued so far, newest first — refetches on mount for the same reason useCompanyStats does. */
export function useDemoAccessCodes() {
  return useQuery({
    queryKey: [...queryKeys.companies.all, "demo-access-codes"] as const,
    queryFn: () => listDemoAccessCodes(getBrowserApiClient()),
    refetchOnMount: "always",
  });
}
