import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSession } from "@/lib/session";

/** How often the idle check re-fires while the app is in the foreground. */
const CHECK_INTERVAL_MS = 15_000;

/**
 * A "background" AppState transition doesn't always mean the cashier
 * actually left the app — the software keyboard opening/closing, a system
 * permission dialog, or a task-switcher swipe can all report a spurious
 * background blip on some Android devices for a few hundred ms before
 * bouncing straight back to "active." Locking on every one of those reads
 * as the PIN prompt "always showing." This grace window is canceled the
 * moment "active" comes back before it fires, so a genuine switch-away
 * (home button, another app) still locks fast, just not instantly.
 */
const BACKGROUND_GRACE_MS = 3_000;

const IdleActivityContext = createContext<(() => void) | null>(null);

/**
 * Activity ping from children that can't bubble RN touches (Admin WebView).
 * No-op outside an idle-lock layout.
 */
export function useIdleActivity(): () => void {
  return useContext(IdleActivityContext) ?? (() => undefined);
}

/**
 * Prompts the same cashier back for their PIN in place (PinRelockOverlay)
 * after `timeoutMinutes` of no touch activity, and immediately when the app
 * is backgrounded (switch to another app / home). iOS `inactive` alone
 * (Control Center) does not lock — only `background` does, plus the
 * foreground idle interval. Not a navigation — the screen underneath stays
 * exactly where it was; only relock() (lib/session.tsx) fires, which keeps
 * `cashier` set and just clears the auth token until re-verified.
 *
 * `timeoutMinutes <= 0` disables auto-lock entirely (a merchant's explicit
 * choice, from store_settings.idle_timeout_minutes).
 *
 * Timer runs only while this layout is focused — pushing /admin used to leave
 * the POS idle clock ticking under the stack with no touches reaching it, so
 * Backoffice would lock after ~idleTimeout even while the cashier was active
 * in the WebView.
 *
 * Returns `recordActivity`, meant to be wired to a touch handler high in the
 * POS tree (see apps/mobile/app/pos/_layout.tsx) so any tap/scroll resets
 * the clock. Wrap with IdleActivityProvider so WebView screens can ping the
 * same clock via useIdleActivity().
 */
export function useIdleLock(timeoutMinutes: number): () => void {
  const { relock } = useSession();
  const lastActivityRef = useRef(Date.now());

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (timeoutMinutes <= 0) return;

      recordActivity();
      const timeoutMs = timeoutMinutes * 60_000;
      let backgroundTimer: ReturnType<typeof setTimeout> | null = null;

      function checkIdle() {
        if (Date.now() - lastActivityRef.current >= timeoutMs) relock();
      }

      const interval = setInterval(checkIdle, CHECK_INTERVAL_MS);
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "background") {
          if (backgroundTimer) return;
          backgroundTimer = setTimeout(() => {
            backgroundTimer = null;
            relock();
          }, BACKGROUND_GRACE_MS);
          return;
        }
        if (state === "active") {
          if (backgroundTimer) {
            clearTimeout(backgroundTimer);
            backgroundTimer = null;
          }
          checkIdle();
        }
      });

      return () => {
        clearInterval(interval);
        subscription.remove();
        if (backgroundTimer) clearTimeout(backgroundTimer);
      };
    }, [timeoutMinutes, relock, recordActivity]),
  );

  return recordActivity;
}

/** Provides recordActivity to WebView (and other non-bubbling) children. */
export function IdleActivityProvider({
  recordActivity,
  children,
}: {
  recordActivity: () => void;
  children: ReactNode;
}) {
  return createElement(IdleActivityContext.Provider, { value: recordActivity }, children);
}
