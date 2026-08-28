"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Search,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button, ButtonLink, Input } from "@/components/ui";
import { DEFAULT_PAGE_SIZE } from "@/lib/list-query";

/** Client-side search — updates URL via router, no full page reload. */
export function SearchField({
  placeholder = "Search…",
  defaultValue = "",
  param = "q",
  preserve = {},
  className,
}: {
  placeholder?: string;
  defaultValue?: string;
  param?: string;
  /** Other query keys to keep when searching (filters, etc.). Page is dropped. */
  preserve?: Record<string, string | undefined>;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, entry] of Object.entries(preserve)) {
      if (entry) next.set(key, entry);
      else next.delete(key);
    }
    const trimmed = value.trim();
    if (trimmed) next.set(param, trimmed);
    else next.delete(param);
    next.delete("page");
    const qs = next.toString();
    router.replace((qs ? `${pathname}?${qs}` : pathname) as Route);
  }

  return (
    <form onSubmit={handleSubmit} className={`relative min-w-0 flex-1 sm:max-w-sm ${className ?? ""}`}>
      <Input
        name={param}
        value={value}
        onChange={(event) => setValue(event.target.value)}
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
  addHref,
  addDisabled,
  exportHref,
  importHref,
  children,
  hideSearch = false,
  embedded = false,
}: {
  searchPlaceholder: string;
  query?: string;
  preserve?: Record<string, string | undefined>;
  addLabel?: string;
  onAdd?: () => void;
  addHref?: string;
  /** When true, Add stays visible but disabled (e.g. location filter is All). */
  addDisabled?: boolean;
  exportHref?: string;
  importHref?: string;
  children?: ReactNode;
  hideSearch?: boolean;
  /** No outer padding or border — for custom card headers. */
  embedded?: boolean;
}) {
  const content = (
    <>
      {!hideSearch ? (
        <SearchField
          placeholder={searchPlaceholder}
          defaultValue={query ?? ""}
          preserve={preserve}
        />
      ) : null}
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
        {addHref && addLabel ? (
          <ButtonLink href={addHref} icon={Plus} size="sm">
            {addLabel}
          </ButtonLink>
        ) : onAdd && addLabel ? (
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
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {content}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
      {content}
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
  const router = useRouter();

  function goToPage(nextPage: number) {
    router.replace(pageHref(basePath, nextPage, query));
  }

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
          <button type="button" onClick={() => goToPage(page - 1)} className={linkClass}>
            <ChevronLeft size={14} />
            Prev
          </button>
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
          <button type="button" onClick={() => goToPage(page + 1)} className={linkClass}>
            Next
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export type { LucideIcon };
