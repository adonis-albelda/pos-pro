import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { listLocations } from "@double-a/api-client/queries";
import type { Location } from "@double-a/shared-types";
import { getApiClient } from "@/lib/api/session";
import {
  getActiveLocationId,
  getEnrolledRole,
  setActiveLocationId,
  type EnrolledRole,
} from "@/lib/device";

interface LocationScopeValue {
  role: EnrolledRole | null;
  /** null until hydrated */
  locationId: string | null;
  locations: Location[];
  canSwitch: boolean;
  ready: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Persist choice only — caller must full-pull after (SyncProvider.replaceAll). */
  setLocationId: (locationId: string) => Promise<void>;
}

const LocationScopeContext = createContext<LocationScopeValue | null>(null);

export function LocationScopeProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<EnrolledRole | null>(null);
  const [locationId, setLocationIdState] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextRole, nextLocationId] = await Promise.all([
      getEnrolledRole(),
      getActiveLocationId(),
    ]);
    setRole(nextRole);
    setLocationIdState(nextLocationId);

    if (nextRole === "admin") {
      try {
        const rows = await listLocations(getApiClient(), {
          type: "branch",
          includeInactive: false,
        });
        setLocations(rows);
        setError(null);
      } catch (cause) {
        setLocations([]);
        setError(cause instanceof Error ? cause.message : "Could not load locations.");
      }
    } else {
      setLocations([]);
    }

    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setLocationId = useCallback(async (nextId: string) => {
    await setActiveLocationId(nextId);
    setLocationIdState(nextId);
  }, []);

  const value = useMemo<LocationScopeValue>(
    () => ({
      role,
      locationId,
      locations,
      canSwitch: role === "admin",
      ready,
      error,
      refresh,
      setLocationId,
    }),
    [role, locationId, locations, ready, error, refresh, setLocationId],
  );

  return (
    <LocationScopeContext.Provider value={value}>{children}</LocationScopeContext.Provider>
  );
}

export function useLocationScope(): LocationScopeValue {
  const ctx = useContext(LocationScopeContext);
  if (!ctx) {
    throw new Error("useLocationScope must be used inside LocationScopeProvider");
  }
  return ctx;
}
