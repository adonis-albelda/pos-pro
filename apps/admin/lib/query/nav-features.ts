"use client";

import { useFeatureFlags } from "@/lib/query/features";
import { useAiSettings } from "@/lib/query/ai-settings";

/** Nav + page gates: platform flag plus shop opt-in for photo AI. */
export function useNavFeatureEnabled() {
  const { isEnabled, ...rest } = useFeatureFlags();
  const aiQuery = useAiSettings();

  function navIsEnabled(key: string): boolean {
    if (!isEnabled(key)) {
      return false;
    }

    if (key === "product_photo_ai") {
      if (!aiQuery.data?.platformAvailable) {
        return false;
      }

      return aiQuery.data.enabled || aiQuery.data.bypassesLimits;
    }

    return true;
  }

  return { isEnabled: navIsEnabled, ...rest };
}
