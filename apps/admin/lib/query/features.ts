"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getFeatureFlags,
  listFeatureFlagsAdmin,
  setCompanyFeatureOverride,
  updateFeatureFlag,
  type FeatureFlagAdmin,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

/**
 * {key: enabled} for the caller's own company — what nav items, buttons, and
 * whole pages hide behind when a superadmin has turned a feature off. Any
 * key missing from this map (still loading, or a request that failed) reads
 * as enabled — CLAUDE.md's own pattern for a terminal that hasn't synced
 * yet: fail toward showing the app working, not toward hiding things.
 */
export function useFeatureFlags() {
  const query = useQuery({
    queryKey: queryKeys.featureFlags.mine(),
    queryFn: () => getFeatureFlags(getBrowserApiClient()),
    staleTime: 60_000,
  });

  return {
    ...query,
    isEnabled: (key: string) => query.data?.[key] ?? true,
  };
}

/** Superadmin-only (CLAUDE.md §15) — every flag, its global default, and every company overriding it. */
export function useFeatureFlagsAdmin() {
  return useQuery({
    queryKey: queryKeys.featureFlags.admin(),
    queryFn: () => listFeatureFlagsAdmin(getBrowserApiClient()),
    refetchOnMount: "always",
  });
}

/** Call after feature-flag mutations succeed. */
export function useInvalidateFeatureFlags() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.all });
}

export function useUpdateFeatureFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      updateFeatureFlag(getBrowserApiClient(), key, enabled),
    onSuccess: (_, { key, enabled }) => {
      queryClient.setQueryData<FeatureFlagAdmin[]>(queryKeys.featureFlags.admin(), (current) =>
        current?.map((flag) => (flag.key === key ? { ...flag, enabled } : flag)),
      );
      queryClient.setQueryData<Record<string, boolean>>(queryKeys.featureFlags.mine(), (current) =>
        current ? { ...current, [key]: enabled } : current,
      );
    },
  });
}

export function useSetCompanyFeatureOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      companyId,
      key,
      enabled,
    }: {
      companyId: string;
      key: string;
      enabled: boolean | null;
    }) => setCompanyFeatureOverride(getBrowserApiClient(), companyId, key, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.admin() });
    },
  });
}
