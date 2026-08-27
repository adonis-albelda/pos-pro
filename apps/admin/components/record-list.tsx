"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Search,
  Upload,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button, ButtonLink, Input } from "@/components/ui";
import { DEFAULT_PAGE_SIZE } from "@/lib/list-query";

/** Plain GET form — URL stays source of truth, no client router needed. */
export function SearchField({
  placeholder = "Search…",
  defaultValue = "",
  param = "q",
  preserve = {},
}: {
  placeholder?: string;
  defaultValue?: string;
  param?: string;
  /** Other query keys to keep when searching (filters, etc.). Page is dropped. */
  preserve?: Record<string, string | undefined>;
}) {
  return (
    <form method="get" className="relative min-w-0 flex-1 sm:max-w-sm">
      {Object.entries(preserve).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null,
      )}
      <Input
        name={param}
        defaultValue={defaultValue}
        placeholder={placeholder}
        icon={Search}
        aria-label={placeholder}
      />
    </form>
  );
}

export function RecordToolbar({
  searchPlaceholder,
  query,
  preserve,
  addLabel,
  onAdd,
  addDisabled,
  exportHref,
  importHref,
  children,
}: {
  searchPlaceholder: string;
  query?: string;
  preserve?: Record<string, string | undefined>;
  addLabel?: string;
  onAdd?: () => void;
  /** When true, Add stays visible but disabled (e.g. location filter is All). */
  addDisabled?: boolean;
  exportHref?: string;
  importHref?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
      <SearchField
        placeholder={searchPlaceholder}
        defaultValue={query ?? ""}
        preserve={preserve}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {children}
        {exportHref ? (
          <ButtonLink href={exportHref} icon={Download} download size="sm">
            Export
          </ButtonLink>
        ) : null}
        {importHref ? (
          <ButtonLink href={importHref} icon={Upload} size="sm">
            Import
          </ButtonLink>
        ) : null}
        {onAdd && addLabel ? (
          <Button
            type="button"
            icon={Plus}
            size="sm"
            onClick={onAdd}
            disabled={addDisabled}
            title={
              addDisabled
                ? "Pick a specific location to create records"
                : undefined
            }
          >
            {addLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function pageHref(
  basePath: string,
  page: number,
  query: Record<string, string | undefined>,
): Route {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const qs = next.toString();
  return (qs ? `${basePath}?${qs}` : basePath) as Route;
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize = DEFAULT_PAGE_SIZE,
  basePath,
  query = {},
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize?: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  if (total === 0 || pageCount <= 1) {
    return total > 0 ? (
      <p className="border-t border-border px-4 py-3 text-caption text-ink-muted sm:px-6">
        {total} {total === 1 ? "record" : "records"}
      </p>
    ) : null;
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const linkClass =
    "inline-flex h-8 items-center gap-1 rounded-sm border border-border bg-surface px-3 text-caption font-medium text-ink hover:bg-paper";
  const disabledClass =
    "inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-sm border border-border px-3 text-caption text-ink-muted opacity-50";

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-caption text-ink-muted">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        {page <= 1 ? (
          <span className={disabledClass}>
            <ChevronLeft size={14} />
            Prev
          </span>
        ) : (
          <Link href={pageHref(basePath, page - 1, query)} className={linkClass}>
            <ChevronLeft size={14} />
            Prev
          </Link>
        )}
        <span className="num text-caption text-ink-muted">
          {page} / {pageCount}
        </span>
        {page >= pageCount ? (
          <span className={disabledClass}>
            Next
            <ChevronRight size={14} />
          </span>
        ) : (
          <Link href={pageHref(basePath, page + 1, query)} className={linkClass}>
            Next
            <ChevronRight size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}

export type { LucideIcon };
