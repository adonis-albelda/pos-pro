"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import type { ProductSort, ProductStockState } from "@double-a/api-client/queries";
import { Button, Field, Select } from "@/components/ui";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const STATE_LABELS: Record<ProductStockState, string> = {
  attention: "Needs attention",
  low: "Low stock",
  out: "Out of stock",
  oversold: "Oversold",
  healthy: "In stock",
  hidden: "Hidden from terminals",
};

const SORT_LABELS: Record<ProductSort, string> = {
  "price-asc": "Price, cheapest first",
  "price-desc": "Price, highest first",
  "stock-asc": "Stock, lowest first",
  "stock-desc": "Stock, highest first",
  "short-desc": "Furthest below reorder point",
  "value-desc": "Money tied up, highest first",
};

function describeActiveFilters(params: URLSearchParams): string {
  const parts: string[] = [];
  const state = params.get("state");
  const sort = params.get("sort");

  if (state && state in STATE_LABELS) parts.push(STATE_LABELS[state as ProductStockState]);
  if (sort && sort in SORT_LABELS) parts.push(SORT_LABELS[sort as ProductSort]);

  return parts.length > 0 ? parts.join(" · ") : "All products";
}

function ProductsFiltersForm({ onApplied }: { onApplied: () => void }) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(formData: FormData) {
    // q/trashed live outside this form — preserve them rather than
    // rebuilding the querystring from just this form's fields.
    const next = new URLSearchParams();
    for (const key of ["q", "trashed"]) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value) next.set(key, value);
    }
    router.push(`/products?${next.toString()}` as Route);
    onApplied();
  }

  function clear() {
    const next = new URLSearchParams();
    for (const key of ["q", "trashed"]) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    router.push((qs ? `/products?${qs}` : "/products") as Route);
    onApplied();
  }

  return (
    <form action={apply} className="space-y-4">
      <Field label="Status">
        <Select name="state" defaultValue={params.get("state") ?? ""}>
          <option value="">Any</option>
          {Object.entries(STATE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Sort by">
        <Select name="sort" defaultValue={params.get("sort") ?? ""}>
          <option value="">Name (A–Z)</option>
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" icon={X} onClick={clear}>
          Clear
        </Button>
        <Button type="submit" icon={SlidersHorizontal}>
          Apply
        </Button>
      </div>
    </form>
  );
}

/** Compact filter control — opens a popover with status + sort. */
export function ProductsFiltersPopover({ className }: { className?: string }) {
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const summary = describeActiveFilters(params);
  const active = summary !== "All products";

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
          aria-label="Filter products"
          className={cx(
            "absolute top-[calc(100%+6px)] right-0 z-50 w-[min(22rem,calc(100vw-1.5rem))]",
            "rounded-md border border-border bg-surface p-4 shadow-lg",
          )}
        >
          <div className="mb-4 border-b border-border pb-3">
            <p className="text-body font-semibold text-ink">Filter products</p>
            <p className="mt-0.5 text-caption text-ink-muted">{summary}</p>
          </div>
          <ProductsFiltersForm onApplied={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
