"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import type { Product } from "@double-a/shared-types";
import { listProductsPage } from "@double-a/api-client/queries";
import { IconButton } from "@/components/ui";
import { getBrowserApiClient } from "@/lib/api/browser-client";

const PAGE_SIZE = 50;
const LOAD_MORE_THRESHOLD_PX = 80;
const SEARCH_DEBOUNCE_MS = 150;

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const CONTROL_STYLES =
  "w-full rounded-sm border border-border bg-surface px-3 text-body text-ink shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-ink-muted focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Supplier-scoped product picker for receiving lines — paginated API +
 * infinite scroll, same pattern as inventory/stock-form ProductPicker.
 */
export function MatchProductCombobox({
  supplierId,
  locationId,
  excludeProductIds,
  value,
  selectedLabel,
  onPick,
  onClear,
  placeholder = "Search your catalogue…",
  disabled,
  className,
}: {
  supplierId?: string;
  locationId?: string;
  excludeProductIds: string[];
  value: string;
  /** Fallback label when the selected product is not in loaded pages yet. */
  selectedLabel?: string;
  onPick: (product: Product) => void;
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

  const excluded = useMemo(() => new Set(excludeProductIds), [excludeProductIds]);

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
    queryKey: ["receiving", "match-product", supplierId ?? "all", locationId, debouncedTerm],
    queryFn: ({ pageParam }) =>
      listProductsPage(getBrowserApiClient(), {
        q: debouncedTerm || undefined,
        page: pageParam,
        pageSize: PAGE_SIZE,
        includeInactive: true,
        locationId: locationId || undefined,
        supplierId: supplierId || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length < lastPage.lastPage ? allPages.length + 1 : undefined,
    enabled: open && !disabled,
  });

  const matches = useMemo(() => {
    const seen = new Set<string>();
    const out: Product[] = [];
    for (const page of pickerQuery.data?.pages ?? []) {
      for (const product of page.products) {
        if (seen.has(product.id) || excluded.has(product.id)) continue;
        seen.add(product.id);
        out.push(product);
      }
    }
    return out;
  }, [pickerQuery.data, excluded]);

  const selectedProduct = useMemo(() => {
    if (!value) return null;
    for (const page of pickerQuery.data?.pages ?? []) {
      const hit = page.products.find((product) => product.id === value);
      if (hit) return hit;
    }
    return null;
  }, [pickerQuery.data, value]);

  function onPanelScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (
      distanceFromBottom < LOAD_MORE_THRESHOLD_PX &&
      pickerQuery.hasNextPage &&
      !pickerQuery.isFetchingNextPage
    ) {
      void pickerQuery.fetchNextPage();
    }
  }

  function commit(product: Product) {
    onPick(product);
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
      setHighlighted((index) => Math.min(index + 1, matches.length - 1));
      return;
    }
    if (!open) return;

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const product = matches[highlighted];
      if (product) commit(product);
    } else if (event.key === "Escape") {
      setOpen(false);
      setTerm("");
      inputRef.current?.blur();
    }
  }

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
          value={open ? term : (selectedProduct?.name ?? selectedLabel ?? "")}
          placeholder={selectedProduct ? undefined : placeholder}
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
            onScroll={onPanelScroll}
            style={{
              position: "fixed",
              top: panelRect.top,
              left: panelRect.left,
              width: panelRect.width,
            }}
            className="z-50 max-h-80 overflow-y-auto rounded-sm border border-border bg-surface p-1 shadow-lg"
          >
            {pickerQuery.isLoading && matches.length === 0 ? (
              <p className="flex items-center justify-center gap-1.5 px-3 py-3 text-caption text-ink-muted">
                <Loader2 size={13} className="animate-spin" />
                Loading products…
              </p>
            ) : matches.length === 0 ? (
              <p className="px-3 py-2 text-caption text-ink-muted">No matches.</p>
            ) : (
              matches.map((product, index) => (
                <button
                  key={product.id}
                  type="button"
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => commit(product)}
                  className={cx(
                    "flex w-full flex-col items-start gap-0.5 rounded-sm px-3 py-2 text-left text-body",
                    index === highlighted ? "bg-primary-tint text-ink" : "text-ink hover:bg-paper",
                    product.id === value && "font-medium",
                  )}
                >
                  <span className="min-w-0 break-words">{product.name}</span>
                  {product.sku ? (
                    <span className="text-caption text-ink-muted">{product.sku}</span>
                  ) : null}
                </button>
              ))
            )}
            {pickerQuery.isFetchingNextPage ? (
              <p className="flex items-center justify-center gap-1.5 py-2 text-caption text-ink-muted">
                <Loader2 size={13} className="animate-spin" />
                Loading more…
              </p>
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
