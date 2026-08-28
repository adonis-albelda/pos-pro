import { useEffect, useState } from "react";
import { getLocalAiSettings } from "@/db/ai-settings";
import { useSync } from "@/sync/sync-provider";

/**
 * Shop opt-in from Settings, as last pulled. POS chrome uses the
 * `product_photo_ai` feature flag instead; this hook is for flows that
 * actually call AI and need the company toggle on top of the platform flag.
 */
export function useAiShopEnabled(): boolean {
  const { dataVersion } = useSync();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;

    void getLocalAiSettings().then((settings) => {
      if (alive) setEnabled(settings.platformAvailable && settings.enabled);
    });

    return () => {
      alive = false;
    };
  }, [dataVersion]);

  return enabled;
}
