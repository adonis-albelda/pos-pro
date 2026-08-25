"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { companyStats, listDemoAccessCodes } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

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
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
}

/** Every demo@store.com access code issued so far, newest first — refetches on mount for the same reason useCompanyStats does. */
export function useDemoAccessCodes() {
  return useQuery({
    queryKey: [...queryKeys.companies.all, "demo-access-codes"] as const,
    queryFn: () => listDemoAccessCodes(getBrowserApiClient()),
    refetchOnMount: "always",
  });
}
