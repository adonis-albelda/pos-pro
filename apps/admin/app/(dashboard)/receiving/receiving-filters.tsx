"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import type { Location } from "@double-a/shared-types";
import { Button, Combobox, Field, Select } from "@/components/ui";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const STATUS_LABELS: Record<string, string> = {
  matched: "Matched",
  discrepancy: "Discrepancy",
};

function describeActiveFilters(
  params: URLSearchParams,
  suppliers: { id: string; name: string }[],
  locations: Location[],
): string {
  const parts: string[] = [];
  const supplierId = params.get("supplierId");
  const locationId = params.get("locationId");
  const status = params.get("status");

  if (supplierId) {
    const supplier = suppliers.find((entry) => entry.id === supplierId);
    if (supplier) parts.push(supplier.name);
  }
  if (locationId) {
    const location = locations.find((entry) => entry.id === locationId);
    if (location) parts.push(location.name);
  }
  if (status) {
    parts.push(STATUS_LABELS[status] ?? status);
  }

  return parts.length > 0 ? parts.join(" · ") : "All receipts";
}

function ReceivingFiltersForm({
  suppliers,
  locations,
  onApplied,
}: {
  suppliers: { id: string; name: string }[];
  locations: Location[];
  onApplied: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(formData: FormData) {
    // Date range lives in its own DateRangePicker, outside this form —
    // preserve q/from/to rather than rebuilding the querystring from just
    // this form's fields, or Apply would silently clear the range.
    const next = new URLSearchParams();
    for (const key of ["q", "from", "to"]) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value) next.set(key, value);
    }
    router.push(`/receiving?${next.toString()}` as Route);
    onApplied();
  }

  function clear() {
    const next = new URLSearchParams();
    for (const key of ["q", "from", "to"]) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    router.push((qs ? `/receiving?${qs}` : "/receiving") as Route);
    onApplied();
  }

  return (
    <form action={apply} className="space-y-4">
      <Field label="Supplier">
        <Combobox
          name="supplierId"
          defaultValue={params.get("supplierId") ?? ""}
          placeholder="Every supplier"
          options={[
            { value: "", label: "Every supplier" },
            ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
          ]}
        />
      </Field>
      <Field label="Branch">
        <Combobox
          name="locationId"
          defaultValue={params.get("locationId") ?? ""}
          placeholder="Every branch"
          options={[
            { value: "", label: "Every branch" },
            ...locations.map((location) => ({ value: location.id, label: location.name })),
          ]}
        />
      </Field>
      <Field label="Status">
        <Select name="status" defaultValue={params.get("status") ?? ""}>
          <option value="">Any</option>
          <option value="matched">Matched</option>
          <option value="discrepancy">Discrepancy</option>
        </Select>
      </Field>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" icon={X} onClick={clear}>
          Clear
        </Button>
        <Button type="submit" icon={Search}>
          Apply
        </Button>
      </div>
    </form>
  );
}

/** Compact filter control — opens a popover, same pattern as SalesFiltersPopover/PurchaseOrdersFiltersPopover. */
export function ReceivingFiltersPopover({
  suppliers,
  locations,
  className,
}: {
  suppliers: { id: string; name: string }[];
  locations: Location[];
  className?: string;
}) {
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const summary = describeActiveFilters(params, suppliers, locations);
  const active = summary !== "All receipts";

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

  return (
    <div ref={rootRef} className={cx("relative min-w-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        className={cx(
          "flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface px-3 text-left sm:h-10 sm:max-w-xs",
          "transition-colors hover:border-ink/20 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:outline-none",
          open && "border-primary ring-2 ring-primary/20",
          active && !open && "border-primary/40 bg-primary/5",
        )}
      >
        <SlidersHorizontal size={16} strokeWidth={2} className="shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate text-body">{summary}</span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={cx("shrink-0 text-ink-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Filter received orders"
          className={cx(
            "absolute top-[calc(100%+6px)] right-0 z-50 w-[min(24rem,calc(100vw-1.5rem))]",
            "rounded-md border border-border bg-surface p-4 shadow-lg",
          )}
        >
          <div className="mb-4 border-b border-border pb-3">
            <p className="text-body font-semibold text-ink">Filter received orders</p>
            <p className="mt-0.5 text-caption text-ink-muted">{summary}</p>
          </div>
          <ReceivingFiltersForm
            suppliers={suppliers}
            locations={locations}
            onApplied={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
