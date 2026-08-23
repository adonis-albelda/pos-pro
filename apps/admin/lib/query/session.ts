"use client";

import { useQuery } from "@tanstack/react-query";
import { me } from "@double-a/api-client/queries";
import { getBrowserApiClient, hasBrowserSession } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

/**
 * The signed-in user, fetched client-side — backs AdminGate's isShopAdmin()
 * gate on every dashboard page that used to run that check in a Server
 * Component before rendering anything. `enabled: hasBrowserSession()` skips
 * the call entirely (and leaves `data` undefined, same as "not an admin")
 * when there's no session cookie at all, rather than firing a request bound
 * to 401.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.session.me(),
    queryFn: () => me(getBrowserApiClient()),
    enabled: hasBrowserSession(),
    staleTime: 60_000,
    retry: false,
  });
}
