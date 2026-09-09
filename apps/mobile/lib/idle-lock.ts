import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useSession } from "@/lib/session";

/** How often the idle check re-fires while the app is in the foreground. */
const CHECK_INTERVAL_MS = 15_000;

/**
 * Forces the cashier back to PIN-unlock after `timeoutMinutes` of no touch
 * activity, and immediately when the app is backgrounded (switch to another
 * app / home). iOS `inactive` alone (Control Center) does not lock — only
 * `background` does, plus the foreground idle interval.
 *
 * `timeoutMinutes <= 0` disables auto-lock entirely (a merchant's explicit
 * choice, from store_settings.idle_timeout_minutes).
 *
 * Returns `recordActivity`, meant to be wired to a touch handler high in the
 * POS tree (see apps/mobile/app/pos/_layout.tsx) so any tap/scroll resets
 * the clock.
 */
export function useIdleLock(timeoutMinutes: number): () => void {
  const { lock } = useSession();
  const lastActivityRef = useRef(Date.now());

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (timeoutMinutes <= 0) return;

    recordActivity();
    const timeoutMs = timeoutMinutes * 60_000;

    function checkIdle() {
      if (Date.now() - lastActivityRef.current >= timeoutMs) lock();
    }

    const interval = setInterval(checkIdle, CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        lock();
        return;
      }
      if (state === "active") checkIdle();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recordActivity is stable (useCallback, empty deps); only timeoutMinutes/lock should restart the effect.
  }, [timeoutMinutes, lock]);

  return recordActivity;
}
