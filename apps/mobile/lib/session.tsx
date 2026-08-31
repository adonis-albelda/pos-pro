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
  unlock: (user: User, pin: string) => Promise<PinResult>;
  lock: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * The cashier's shift, held in memory only. Closing the app ends the shift.
 * Unlock always calls live verify_pin — local SQLite is for POS work after.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [cashier, setCashier] = useState<User | null>(null);

  const unlock = useCallback(async (user: User, pin: string) => {
    const outcome = await verifyPin(user.id, pin);
    if (outcome.result === "ok") {
      setCashier(user);
      setAdminToken(outcome.adminToken, outcome.adminTokenExpiresAt);
    }
    return outcome.result;
  }, []);

  const lock = useCallback(() => {
    setCashier(null);
    setAdminToken(null);
  }, []);

  const value = useMemo(() => ({ cashier, unlock, lock }), [cashier, unlock, lock]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}
