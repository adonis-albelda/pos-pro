"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { ApiError } from "@double-a/api-client";
import { notifyRateLimited } from "@/lib/rate-limit-notice";

function handleGlobalError(error: unknown): void {
  if (error instanceof ApiError && (error.isTooManyRequests || error.isServerError)) {
    notifyRateLimited();
  }
}

/**
 * One QueryClient per browser session, created inside the component (not at
 * module scope) so server rendering never shares cache/state across users —
 * standard App Router pattern. staleTime is long by default: admin is
 * read-heavy navigation (products, customers, suppliers... back and forth),
 * and every write path already calls queryClient.invalidateQueries() on
 * success (see lib/query/*), so nothing here can hide a change you just
 * made — a long staleTime only skips a redundant refetch on data nothing
 * touched, e.g. revisiting the products page a few minutes later still
 * shows the cached page instantly with zero network request. gcTime is
 * set well past staleTime so a query isn't evicted from memory (forcing a
 * real refetch) just for being unmounted a few minutes between visits —
 * individual hooks (see lib/query/features.ts, session.ts) still override
 * staleTime downward where it's deliberately shorter than this default.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handleGlobalError }),
        mutationCache: new MutationCache({ onError: handleGlobalError }),
        defaultOptions: {
          queries: {
            staleTime: 5 * 60_000,
            gcTime: 30 * 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
