import { useEffect, useState } from "react";
import { getLocalAiSettings } from "@/db/ai-settings";
import { useSync } from "@/sync/sync-provider";

/**
 * Whether this shop has AI turned on, as last pulled. Icon hidden until both
 * the platform feature and the shop opt-in are true.
 */
export function useAiEnabled(): boolean {
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
