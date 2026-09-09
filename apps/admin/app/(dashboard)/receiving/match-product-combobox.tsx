"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import {
  listProductVariantsPage,
  type ProductVariantListRow,
} from "@double-a/api-client/queries";
import { IconButton } from "@/components/ui";
import { getBrowserApiClient } from "@/lib/api/browser-client";

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 150;
const LOAD_MORE_THRESHOLD_PX = 80;

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const CONTROL_STYLES =
  "w-full rounded-sm border border-border bg-surface px-3 text-body text-ink shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-ink-muted focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50";

/** "Widget — Red / L" when attributes exist; otherwise just the product name. */
export function variantListLabel(variant: ProductVariantListRow): string {
  const attrs = variant.attributeValues
    .map((entry) => entry.value?.trim())
    .filter((value): value is string => Boolean(value));
  return attrs.length > 0 ? `${variant.productName} — ${attrs.join(" / ")}` : variant.productName;
}

/**
 * Catalogue match picker — company-wide product **variants** (not parent
 * products), 30/page, lazy-load on scroll. No supplier filter — every
 * available variant is searchable.
 */
export function MatchProductCombobox({
  locationId,
  excludeVariantIds,
  value,
  selectedLabel,
  onPick,
  onClear,
  placeholder = "Search your catalogue…",
  disabled,
  className,
}: {
  locationId?: string;
  /** Already-matched variant ids on other lines — hidden from this list. */
  excludeVariantIds: string[];
  /** Selected variant id. */
  value: string;
  /** Fallback label when the selected variant is not in loaded pages yet. */
  selectedLabel?: string;
  onPick: (variant: ProductVariantListRow) => void;
  onClear: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const excluded = useMemo(() => new Set(excludeVariantIds), [excludeVariantIds]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedTerm(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [term]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setTerm("");
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPanelRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 560) });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  const pickerQuery = useInfiniteQuery({
    queryKey: ["receiving", "match-variant", locationId ?? "all", debouncedTerm],
    queryFn: ({ pageParam }) =>
      listProductVariantsPage(getBrowserApiClient(), {
        q: debouncedTerm.trim() || undefined,
        page: pageParam,
        pageSize: PAGE_SIZE,
        includeInactive: true,
        locationId: locationId || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.lastPage > 0 && allPages.length < lastPage.lastPage) {
        return allPages.length + 1;
      }
      if (lastPage.variants.length >= PAGE_SIZE) return allPages.length + 1;
      return undefined;
    },
    enabled: open && !disabled,
  });

  const matches = useMemo(() => {
    const seen = new Set<string>();
    const out: ProductVariantListRow[] = [];
    for (const page of pickerQuery.data?.pages ?? []) {
      for (const variant of page.variants) {
        if (seen.has(variant.id) || excluded.has(variant.id)) continue;
        seen.add(variant.id);
        out.push(variant);
      }
    }
    return out;
  }, [pickerQuery.data, excluded]);

  function loadMoreIfNeeded(el: HTMLElement) {
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > LOAD_MORE_THRESHOLD_PX) return;
    if (!pickerQuery.hasNextPage || pickerQuery.isFetchingNextPage) return;
    void pickerQuery.fetchNextPage();
  }

  useEffect(() => {
    if (!open || !pickerQuery.hasNextPage || pickerQuery.isFetchingNextPage) return;
    const el = panelRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + LOAD_MORE_THRESHOLD_PX) {
      void pickerQuery.fetchNextPage();
    }
  }, [
    open,
    matches.length,
    pickerQuery.hasNextPage,
    pickerQuery.isFetchingNextPage,
    pickerQuery.fetchNextPage,
  ]);

  const selectedVariant = useMemo(() => {
    if (!value) return null;
    for (const page of pickerQuery.data?.pages ?? []) {
      const hit = page.variants.find((variant) => variant.id === value);
      if (hit) return hit;
    }
    return null;
  }, [pickerQuery.data, value]);

  function commit(variant: ProductVariantListRow) {
    onPick(variant);
    setOpen(false);
    setTerm("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlighted((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
      return;
    }
    if (!open) return;

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const variant = matches[highlighted];
      if (variant) commit(variant);
    } else if (event.key === "Escape") {
      setOpen(false);
      setTerm("");
      inputRef.current?.blur();
    }
  }

  const closedLabel = selectedVariant ? variantListLabel(selectedVariant) : (selectedLabel ?? "");

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <div className="relative">
        {open ? (
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
          />
        ) : null}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          value={open ? term : closedLabel}
          placeholder={closedLabel ? undefined : placeholder}
          onFocus={() => {
            setOpen(true);
            setTerm("");
            setHighlighted(0);
          }}
          onChange={(event) => {
            setTerm(event.target.value);
            setHighlighted(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={cx(CONTROL_STYLES, "h-11 cursor-text pr-9 sm:h-10", open ? "pl-9" : undefined)}
        />
        <ChevronDown
          size={16}
          className={cx(
            "pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted transition-transform",
            open && "rotate-180",
          )}
        />
        {value ? (
          <IconButton
            icon={X}
            label="Remove product match"
            className="absolute top-1/2 right-8 -translate-y-1/2"
            onClick={onClear}
          />
        ) : null}
      </div>

      {open && panelRect ? (
        <MatchProductPortal>
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: panelRect.top,
              left: panelRect.left,
              width: panelRect.width,
            }}
            onScroll={(event) => loadMoreIfNeeded(event.currentTarget)}
            className="z-50 max-h-80 overflow-y-auto rounded-sm border border-border bg-surface p-1 shadow-lg"
          >
            {pickerQuery.isError ? (
              <p className="px-3 py-2 text-caption text-danger">
                {pickerQuery.error instanceof Error
                  ? pickerQuery.error.message
                  : "Could not load variants."}
              </p>
            ) : pickerQuery.isLoading && matches.length === 0 ? (
              <p className="flex items-center justify-center gap-1.5 px-3 py-3 text-caption text-ink-muted">
                <Loader2 size={13} className="animate-spin" />
                Loading variants…
              </p>
            ) : matches.length === 0 ? (
              <p className="px-3 py-2 text-caption text-ink-muted">No matches.</p>
            ) : (
              matches.map((variant, index) => (
                <button
                  key={variant.id}
                  type="button"
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => commit(variant)}
                  className={cx(
                    "flex w-full flex-col items-start gap-0.5 rounded-sm px-3 py-2 text-left text-body",
                    index === highlighted ? "bg-primary-tint text-ink" : "text-ink hover:bg-paper",
                    variant.id === value && "font-medium",
                  )}
                >
                  <span className="min-w-0 break-words">{variantListLabel(variant)}</span>
                  {variant.sku ? (
                    <span className="text-caption text-ink-muted">{variant.sku}</span>
                  ) : null}
                </button>
              ))
            )}
            {pickerQuery.isFetchingNextPage ? (
              <p className="flex items-center justify-center gap-1.5 py-2 text-caption text-ink-muted">
                <Loader2 size={13} className="animate-spin" />
                Loading more…
              </p>
            ) : pickerQuery.hasNextPage ? (
              <p className="px-3 py-1.5 text-center text-caption text-ink-muted">Scroll for more…</p>
            ) : matches.length > 0 ? (
              <p className="px-3 py-1.5 text-center text-caption text-ink-muted">End of catalogue</p>
            ) : null}
          </div>
        </MatchProductPortal>
      ) : null}
    </div>
  );
}

function MatchProductPortal({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.body), []);
  if (!target) return null;
  return createPortal(children, target);
}
