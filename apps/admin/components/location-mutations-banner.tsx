"use client";

import { MapPin } from "lucide-react";
import { usePathname } from "next/navigation";
import { useOptionalLocationFilter } from "@/components/location-filter-provider";

/** Paths where catalog CRUD stays allowed even when location filter is All. */
const CATALOG_PATH_PREFIXES = ["/products", "/categories", "/suppliers"];

export function useLocationMutationsLocked(): boolean {
  const { locationId } = useOptionalLocationFilter();
  const pathname = usePathname();
  if (CATALOG_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
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
        Create, update, and delete are disabled until you select a specific location.
        Products, categories, and suppliers stay editable — they are company-wide.
      </p>
    </div>
  );
}
