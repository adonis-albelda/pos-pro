"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import type { PurchaseOrderStatus, Supplier } from "@double-a/shared-types";
import { PURCHASE_ORDER_STATUS_LABELS } from "@double-a/shared-types";
import { Button, Combobox, Field, Select } from "@/components/ui";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const STATUSES = Object.keys(PURCHASE_ORDER_STATUS_LABELS) as PurchaseOrderStatus[];

function describeActiveFilters(params: URLSearchParams, suppliers: Supplier[]): string {
  const parts: string[] = [];
  const supplierId = params.get("supplierId");
  const status = params.get("status") as PurchaseOrderStatus | null;

  if (supplierId) {
    const supplier = suppliers.find((entry) => entry.id === supplierId);
    if (supplier) parts.push(supplier.name);
  }
  if (status && status in PURCHASE_ORDER_STATUS_LABELS) {
    parts.push(PURCHASE_ORDER_STATUS_LABELS[status]);
  }

  return parts.length > 0 ? parts.join(" · ") : "All orders";
}

/** Compact filter control — opens a popover with supplier + status, same pattern as ProductsFiltersPopover/SalesFiltersPopover. */
export function PurchaseOrdersFiltersPopover({
  suppliers,
  className,
}: {
  suppliers: Supplier[];
  className?: string;
}) {
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const summary = describeActiveFilters(params, suppliers);
  const active = summary !== "All orders";

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
          "flex h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface px-3 text-left sm:max-w-xs",
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
          aria-label="Filter purchase orders"
          className="absolute top-[calc(100%+6px)] right-0 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-md border border-border bg-surface p-4 shadow-lg"
        >
          <div className="mb-4 border-b border-border pb-3">
            <p className="text-body font-semibold text-ink">Filter purchase orders</p>
            <p className="mt-0.5 text-caption text-ink-muted">{summary}</p>
          </div>
          <PurchaseOrdersFilters suppliers={suppliers} onDone={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

export function PurchaseOrdersFilters({
  suppliers,
  onDone,
}: {
  suppliers: Supplier[];
  /** Fired after apply or clear navigates — lets a dialog/popover host close itself. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(formData: FormData) {
    const next = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value) next.set(key, value);
    }
    const q = params.get("q");
    if (q) next.set("q", q);
    router.push(`/purchase-orders?${next.toString()}` as Route);
    onDone?.();
  }

  return (
    <form action={apply} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
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
        <Field label="Status">
          <Select name="status" defaultValue={params.get("status") ?? ""}>
            <option value="">Any</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {PURCHASE_ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button type="submit" icon={Search} className="w-full sm:w-auto">
          Apply
        </Button>
        <Button
          type="button"
          variant="secondary"
          icon={X}
          className="w-full sm:w-auto"
          onClick={() => {
            router.push("/purchase-orders" as Route);
            onDone?.();
          }}
        >
          Clear
        </Button>
      </div>
    </form>
  );
}
