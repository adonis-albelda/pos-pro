"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Building2, Check, ChevronDown, MapPin, Warehouse } from "lucide-react";
import type { Location } from "@double-a/shared-types";
import { useLocations } from "@/lib/query/locations";
import { useOptionalLocationFilter } from "@/components/location-filter-provider";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Header scope control as a popover (not a native select) so each
 * branch/warehouse can show name + address. Default = all locations.
 */
export function LocationSwitcher({
  className,
  tone = "default",
}: {
  className?: string;
  /** classic title bar sits on primary blue */
  tone?: "default" | "onPrimary";
}) {
  const { locationId, setLocationId } = useOptionalLocationFilter();
  const locationsQuery = useLocations({ includeInactive: false });
  const locations = locationsQuery.data ?? [];
  const selected = locations.find((row) => row.id === locationId) ?? null;

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(id: string | null) {
    setLocationId(id);
    setOpen(false);
  }

  const triggerLabel = selected ? selected.name : "All locations";
  const triggerHint = selected
    ? selected.address?.trim() || (selected.type === "warehouse" ? "Warehouse" : "Branch")
    : "Company-wide stock and sales";

  // Nothing to switch between — one location and "all locations" mean the
  // same thing, so the picker is dead weight. Still shown while pending
  // (count isn't known yet) so it doesn't flash in and out on load.
  if (!locationsQuery.isPending && locations.length <= 1) return null;

  return (
    <div ref={rootRef} className={cx("relative min-w-0", className)}>
      <button
        type="button"
        disabled={locationsQuery.isPending}
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={listId}
        title="Scope stock and sales to one location"
        className={cx(
          "flex h-9 max-w-[16rem] cursor-pointer items-center gap-2 rounded-sm px-2.5 text-left transition-colors",
          "focus-visible:ring-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60",
          tone === "onPrimary"
            ? "border border-white/30 bg-white text-ink hover:bg-white/95 focus-visible:ring-white/50"
            : "border border-border bg-surface text-ink hover:border-ink/20 focus-visible:ring-primary/30",
          open && tone === "default" && "border-primary ring-2 ring-primary/20",
          open && tone === "onPrimary" && "ring-2 ring-white/40",
        )}
      >
        <MapPin size={14} strokeWidth={2} className="shrink-0 text-ink-muted" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-caption font-semibold leading-tight">
            {triggerLabel}
          </span>
          <span className="block truncate text-[11px] leading-tight text-ink-muted">
            {triggerHint}
          </span>
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={cx("shrink-0 text-ink-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={listId}
          role="dialog"
          aria-label="Choose location"
          className={cx(
            "absolute top-[calc(100%+6px)] right-0 z-50 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden",
            "rounded-md border border-border bg-surface shadow-lg",
          )}
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="text-caption font-semibold text-ink">Location scope</p>
            <p className="text-[11px] text-ink-muted">
              Filters stock and sales. Catalog stays company-wide.
            </p>
          </div>

          <ul className="max-h-[min(22rem,60vh)] overflow-y-auto py-1" role="listbox">
            <LocationOption
              selected={!selected}
              title="All locations"
              subtitle="Every branch and warehouse combined"
              icon={<Building2 size={15} strokeWidth={2} />}
              onSelect={() => pick(null)}
            />

            {locations.length === 0 ? (
              <li className="px-3 py-3 text-caption text-ink-muted">No active locations yet.</li>
            ) : (
              locations.map((location) => (
                <LocationOption
                  key={location.id}
                  selected={selected?.id === location.id}
                  title={location.name}
                  subtitle={formatLocationMeta(location)}
                  icon={
                    location.type === "warehouse" ? (
                      <Warehouse size={15} strokeWidth={2} />
                    ) : (
                      <MapPin size={15} strokeWidth={2} />
                    )
                  }
                  onSelect={() => pick(location.id)}
                />
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function formatLocationMeta(location: Location): string {
  const typeLabel = location.type === "warehouse" ? "Warehouse" : "Branch";
  const address = location.address?.trim();
  return address ? `${typeLabel} · ${address}` : typeLabel;
}

function LocationOption({
  selected,
  title,
  subtitle,
  icon,
  onSelect,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  icon: ReactNode;
  onSelect: () => void;
}) {
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        onClick={onSelect}
        className={cx(
          "flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
          "hover:bg-border/50 focus-visible:bg-border/50 focus-visible:outline-none",
          selected && "bg-primary/8",
        )}
      >
        <span
          className={cx(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
            selected ? "bg-primary/15 text-primary" : "bg-paper text-ink-muted",
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-ink">{title}</span>
          <span className="mt-0.5 block text-caption leading-snug text-ink-muted">{subtitle}</span>
        </span>
        {selected ? (
          <Check size={16} strokeWidth={2.5} className="mt-1 shrink-0 text-primary" aria-hidden />
        ) : (
          <span className="size-4 shrink-0" aria-hidden />
        )}
      </button>
    </li>
  );
}
