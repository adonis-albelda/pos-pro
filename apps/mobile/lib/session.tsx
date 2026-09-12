import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@double-a/shared-types";
import { setAdminToken } from "@/lib/api/session";
import { verifyPin, type PinResult } from "@/lib/pin";

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
  /** Explicit "End shift" — a different person may unlock next, so this must actually clear who's on shift, not just re-prompt the same one. */
  lock: () => void;
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
    }
    return outcome.result;
  }, []);

  const relock = useCallback(() => {
    setLocked(true);
    setAdminToken(null);
  }, []);

  const lock = useCallback(() => {
    setCashier(null);
    setLocked(false);
    setAdminToken(null);
  }, []);

  const value = useMemo(
    () => ({ cashier, locked, unlock, relock, lock }),
    [cashier, locked, unlock, relock, lock],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}
