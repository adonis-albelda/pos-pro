"use client";

import { MapPin } from "lucide-react";
import { usePathname } from "next/navigation";
import { useOptionalLocationFilter } from "@/components/location-filter-provider";
import { useLocations } from "@/lib/query/locations";

/** Paths where catalog CRUD stays allowed even when location filter is All. */
const CATALOG_PATH_PREFIXES = ["/products", "/categories", "/suppliers"];

export function useLocationMutationsLocked(): boolean {
  const { locationId } = useOptionalLocationFilter();
  const pathname = usePathname();
  const locationsQuery = useLocations({ includeInactive: false });

  if (CATALOG_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false;
  }

  // One branch total — nothing to disambiguate, so "All locations" and
  // "that one branch" mean the same thing. Same threshold LocationSwitcher
  // uses to hide the picker entirely.
  if (!locationsQuery.isPending && (locationsQuery.data ?? []).length <= 1) {
    return false;
  }

  return locationId === null;
}

export function LocationMutationsBanner() {
  const locked = useLocationMutationsLocked();
  if (!locked) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2.5 sm:px-4 lg:px-5"
    >
      <MapPin size={16} className="mt-0.5 shrink-0 text-amber-700" strokeWidth={2} />
      <p className="text-caption leading-relaxed text-ink">
        Viewing All locations — some actions are restricted. Pick a branch or warehouse to
        create, update, or delete here.
      </p>
    </div>
  );
}
