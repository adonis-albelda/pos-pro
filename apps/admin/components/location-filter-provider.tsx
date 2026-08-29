"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { readCookie } from "@/lib/api/browser-client";
import {
  LOCATION_FILTER_ALL,
  LOCATION_FILTER_COOKIE,
  parseLocationFilterCookie,
} from "@/lib/location-filter";
import { connectRealtime, disconnectRealtime } from "@/lib/realtime";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function writeLocationCookie(locationId: string | null): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const value = locationId ?? LOCATION_FILTER_ALL;
  document.cookie = `${LOCATION_FILTER_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}

interface LocationFilterContextValue {
  /** null = all locations (company-wide totals where the API allows). */
  locationId: string | null;
  setLocationId: (id: string | null) => void;
}

const LocationFilterContext = createContext<LocationFilterContextValue | null>(null);

export function LocationFilterProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [locationId, setLocationIdState] = useState<string | null>(() =>
    parseLocationFilterCookie(readCookie(LOCATION_FILTER_COOKIE)),
  );

  // Live stock ticks for whichever single branch is selected — "all
  // locations" (locationId === null) has no one channel to subscribe to,
  // so this simply stays disconnected until a specific branch is picked.
  useEffect(() => {
    if (!locationId) {
      disconnectRealtime();
      return;
    }

    connectRealtime(locationId, () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    });

    return () => disconnectRealtime();
  }, [locationId, queryClient]);

  const setLocationId = useCallback(
    (id: string | null) => {
      setLocationIdState(id);
      writeLocationCookie(id);
      // Location-scoped lists must not keep stale all-locations rows (and vice versa).
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    [queryClient],
  );

  const value = useMemo(
    () => ({ locationId, setLocationId }),
    [locationId, setLocationId],
  );

  return (
    <LocationFilterContext.Provider value={value}>{children}</LocationFilterContext.Provider>
  );
}

export function useLocationFilter(): LocationFilterContextValue {
  const ctx = useContext(LocationFilterContext);
  if (!ctx) {
    throw new Error("useLocationFilter must be used inside LocationFilterProvider");
  }
  return ctx;
}

/** Safe outside provider (e.g. platform routes) — always "all". */
export function useOptionalLocationFilter(): LocationFilterContextValue {
  const ctx = useContext(LocationFilterContext);
  return ctx ?? { locationId: null, setLocationId: () => undefined };
}
