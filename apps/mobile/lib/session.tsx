import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@double-a/shared-types";
import { setAdminToken, setCashierToken } from "@/lib/api/session";
import { cacheLocalPin, verifyPin, verifyPinLocally, type PinResult } from "@/lib/pin";

interface SessionValue {
  cashier: User | null;
  /**
   * Idle timeout / backgrounding (lib/idle-lock.ts) sets this via relock(),
   * without touching `cashier` — the shift stays attributed to the same
   * person, only the auth token clears (the real security boundary: no API
   * call can succeed until re-unlock). `cashier` going null still means,
   * only ever, "nobody has started a shift" or "the shift just explicitly
   * ended" (see lock() below) — the layouts' <Redirect> to /unlock keys off
   * that alone. `locked` is what a screen shows an in-place PIN overlay for
   * instead (components/pin-relock-overlay.tsx), so idle timeout doesn't
   * bounce the whole app back to the cashier picker over something that
   * isn't a new shift.
   */
  locked: boolean;
  unlock: (user: User, pin: string) => Promise<PinResult>;
  /** Idle timeout / backgrounding — same person, re-verify in place. */
  relock: () => void;
  /**
   * Re-entry after relock() — checks the offline-cached PIN (lib/pin.ts)
   * instead of the live API, so a dead connection mid-shift never strands
   * the cashier at the lock screen. Falls back to the same live path
   * `unlock` uses when nothing is cached yet (fresh install, or this
   * cashier has never unlocked live on this device). Distinct from `unlock`
   * itself, which stays live-only — that one gates a brand-new shift
   * starting, this one just re-confirms a shift already underway.
   */
  relockUnlock: (pin: string) => Promise<PinResult>;
  /** Explicit "End shift" — a different person may unlock next, so this must actually clear who's on shift, not just re-prompt the same one. */
  lock: () => void;
  /** Account tab (Settings) — reflects a self-service field change (e.g. idleTimeoutMinutes) in the in-memory cashier without a full re-unlock. */
  updateCashier: (patch: Partial<User>) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * The cashier's shift, held in memory only. Closing the app ends the shift.
 * Unlock always calls live verify_pin — local SQLite is for POS work after.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [cashier, setCashier] = useState<User | null>(null);
  const [locked, setLocked] = useState(false);

  const unlock = useCallback(async (user: User, pin: string) => {
    const outcome = await verifyPin(user.id, pin);
    if (outcome.result === "ok") {
      setCashier(user);
      setLocked(false);
      setAdminToken(outcome.adminToken, outcome.adminTokenExpiresAt);
      setCashierToken(outcome.cashierToken, outcome.cashierTokenExpiresAt);
      // Best-effort — an idle relock later can survive a dead connection
      // with this cached, but a device that's never gone online since
      // install just keeps falling back to the live path (see relockUnlock).
      void cacheLocalPin(user.id, pin);
    }
    return outcome.result;
  }, []);

  const relock = useCallback(() => {
    setLocked(true);
    setAdminToken(null);
    setCashierToken(null);
  }, []);

  const relockUnlock = useCallback(
    async (pin: string): Promise<PinResult> => {
      if (!cashier) return "wrong-pin";

      const localResult = await verifyPinLocally(cashier.id, pin);
      if (localResult === null) return unlock(cashier, pin);
      if (!localResult) return "wrong-pin";

      setLocked(false);
      // Best-effort live refresh — a cashier's adminToken/cashierToken (set
      // by the shift-start unlock) went stale the moment relock() cleared
      // it; refresh it when reachable, but never gate the unlock on it, or
      // this stops being the offline-safe path it exists for.
      void verifyPin(cashier.id, pin)
        .then((outcome) => {
          if (outcome.result === "ok") {
            setAdminToken(outcome.adminToken, outcome.adminTokenExpiresAt);
            setCashierToken(outcome.cashierToken, outcome.cashierTokenExpiresAt);
          }
        })
        .catch(() => undefined);
      return "ok";
    },
    [cashier, unlock],
  );

  const lock = useCallback(() => {
    setCashier(null);
    setLocked(false);
    setAdminToken(null);
    setCashierToken(null);
  }, []);

  const updateCashier = useCallback((patch: Partial<User>) => {
    setCashier((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo(
    () => ({ cashier, locked, unlock, relock, relockUnlock, lock, updateCashier }),
    [cashier, locked, unlock, relock, relockUnlock, lock, updateCashier],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}
