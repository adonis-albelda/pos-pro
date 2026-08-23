"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { StoreSettings } from "@double-a/shared-types";
import { queryKeys } from "@/lib/query/keys";

/**
 * (dashboard)/layout.tsx already fetches store_settings server-side (for the
 * sidebar's name/logo) on every navigation. Without this, any page calling
 * useStoreSettings() (menu, settings, receipt printing preview, ...) fired
 * its own separate GET /store-settings on top of that — the same row,
 * twice, every single page load. Seeds the TanStack cache under the exact
 * key useStoreSettings() reads, so it's a cache hit there instead.
 */
export function HydrateStoreSettings({ store }: { store: StoreSettings }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.setQueryData(queryKeys.storeSettings.detail(), store);
    // Only the identity of a fresh server fetch should reseed the cache —
    // not every render of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  return null;
}
