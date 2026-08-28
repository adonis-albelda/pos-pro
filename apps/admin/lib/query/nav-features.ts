"use client";

import { useFeatureFlags } from "@/lib/query/features";

/** Nav visibility follows company feature flags only — shop AI opt-in gates usage on the page, not the menu. */
export function useNavFeatureEnabled() {
  return useFeatureFlags();
}
