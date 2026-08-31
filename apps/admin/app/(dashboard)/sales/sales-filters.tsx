"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import type { User } from "@double-a/shared-types";
import { Button, Field, Select } from "@/components/ui";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  voided: "Voided",
  refunded: "Refunded",
};

/** Date range lives in its own DateRangePicker control now, not this popover. */
function describeActiveFilters(
  params: URLSearchParams,
  users: User[],
  devices: string[],
): string {
  const parts: string[] = [];
  const userId = params.get("userId");
  const deviceId = params.get("deviceId");
  const status = params.get("status");

  if (userId) {
    parts.push(users.find((user) => user.id === userId)?.name ?? "Cashier");
  }

  if (deviceId) {
    parts.push(devices.includes(deviceId) ? deviceId : "Terminal");
  }

  if (status) {
    parts.push(STATUS_LABELS[status] ?? status);
  }

  return parts.length > 0 ? parts.join(" · ") : "All sales";
}

function SalesFiltersForm({
  users,
  devices,
  onApplied,
}: {
  users: User[];
  devices: string[];
  onApplied: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(formData: FormData) {
    // Date range is its own DateRangePicker control, outside this form —
    // preserve from/to (and q) rather than rebuilding the querystring from
    // just this form's fields, or Apply would silently clear the range.
    const next = new URLSearchParams();
    for (const key of ["q", "from", "to"]) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value) next.set(key, value);
    }
    router.push(`/sales?${next.toString()}` as Route);
    onApplied();
  }

  function clear() {
    const next = new URLSearchParams();
    for (const key of ["q", "from", "to"]) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    router.push((qs ? `/sales?${qs}` : "/sales") as Route);
    onApplied();
  }

  return (
    <form action={apply} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cashier">
          <Select name="userId" defaultValue={params.get("userId") ?? ""}>
            <option value="">Everyone</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Terminal">
          <Select name="deviceId" defaultValue={params.get("deviceId") ?? ""}>
            <option value="">All terminals</option>
            {devices.map((device) => (
              <option key={device} value={device}>
                {device}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="State">
            <Select name="status" defaultValue={params.get("status") ?? ""}>
              <option value="">Any</option>
              <option value="completed">Completed</option>
              <option value="voided">Voided</option>
              <option value="refunded">Refunded</option>
            </Select>
          </Field>
        </div>
      </div>

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

/** Compact filter control — opens a popover with the full filter form. */
export function SalesFiltersPopover({
  users,
  devices,
  className,
}: {
  users: User[];
  devices: string[];
  className?: string;
}) {
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const summary = describeActiveFilters(params, users, devices);
  const active = summary !== "All sales";

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
          aria-label="Filter sales"
          className={cx(
            "absolute top-[calc(100%+6px)] right-0 z-50 w-[min(24rem,calc(100vw-1.5rem))]",
            "rounded-md border border-border bg-surface p-4 shadow-lg",
          )}
        >
          <div className="mb-4 border-b border-border pb-3">
            <p className="text-body font-semibold text-ink">Filter sales</p>
            <p className="mt-0.5 text-caption text-ink-muted">{summary}</p>
          </div>
          <SalesFiltersForm users={users} devices={devices} onApplied={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
