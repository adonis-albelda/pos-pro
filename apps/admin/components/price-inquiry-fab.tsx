"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, Loader2, Package, Search, Tag, Truck, Warehouse } from "lucide-react";
import { formatMoney } from "@double-a/shared-types";
import type { Product } from "@double-a/shared-types";
import { listProductsPage } from "@double-a/api-client/queries";
import { IconButton, Input, Money } from "@/components/ui";
import { Dialog } from "@/components/overlay";
import { getBrowserApiClient } from "@/lib/api/browser-client";

const PAGE_SIZE = 25;
/** Fetch the next page once the scrolled-past distance from the bottom is under this. */
const LOAD_MORE_THRESHOLD_PX = 80;

/**
 * A quick lookup any staffer can reach from anywhere in the admin — no
 * navigating to Products, no losing whatever page they were on. Deliberately
 * global (mounted once in the dashboard layout), floating so it never
 * competes with a page's own layout for space.
 */
export function PriceInquiryFab() {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);

  // One request per page — the server does the name/SKU/barcode match (see
  // IndexProductsController's `search` param), not a client-side walk of the
  // whole catalogue. Only the first page fires on Search; scrolling near the
  // bottom of the results list fetches the next one, so a match count in the
  // hundreds never means one giant request or a hard 100-row cap.
  // locationId omitted, so stockQuantity comes back company-wide, matching
  // "total stock".
  const query = useInfiniteQuery({
    queryKey: ["price-inquiry", "products", searchTerm],
    queryFn: ({ pageParam }) =>
      listProductsPage(getBrowserApiClient(), { q: searchTerm, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length < lastPage.lastPage ? allPages.length + 1 : undefined,
    enabled: searchTerm !== "",
  });
  const results = query.data?.pages.flatMap((page) => page.products) ?? [];
  const totalMatches = query.data?.pages[0]?.total ?? 0;

  function onResultsScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (
      distanceFromBottom < LOAD_MORE_THRESHOLD_PX &&
      query.hasNextPage &&
      !query.isFetchingNextPage
    ) {
      void query.fetchNextPage();
    }
  }

  function reset() {
    setInputValue("");
    setSearchTerm("");
    setSelected(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function submitSearch() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setSelected(null);
    setSearchTerm(trimmed);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Price inquiry"
        title="Price inquiry"
        className="fixed right-6 bottom-6 z-40 flex size-14 cursor-pointer items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <Tag size={22} strokeWidth={2} />
      </button>

      <Dialog
        open={open}
        onClose={close}
        title="Price inquiry"
        description="Look up a product's cost, stock, supplier and shelf price."
        className="min-w-4xl"
      >
        {selected ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex cursor-pointer items-center gap-1.5 text-caption font-medium text-ink-muted hover:text-ink"
            >
              <ArrowLeft size={14} strokeWidth={2} />
              Back to results
            </button>

            <div className="flex items-center gap-3">
              <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-paper">
                {selected.photoUrl ? (
                  <img src={selected.photoUrl} alt="" className="size-full object-cover" />
                ) : (
                  <Camera size={22} strokeWidth={1.75} className="text-ink-muted" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-body font-semibold text-ink">{selected.name}</p>
                <p className="mt-0.5 text-caption text-ink-muted">
                  {selected.sku ?? "No SKU"}
                  {selected.category ? ` · ${selected.category}` : ""}
                </p>
              </div>
            </div>

            <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-4 text-center">
              <p className="text-caption font-medium text-primary">Shelf price</p>
              <p className="mt-1 text-heading-lg font-bold text-primary">
                {formatMoney(selected.price)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border px-3 py-3">
                <p className="flex items-center gap-1.5 text-caption text-ink-muted">
                  <Tag size={13} />
                  Cost price
                </p>
                <p className="mt-1 text-body-lg font-semibold text-ink">
                  <Money value={selected.costPrice} />
                </p>
              </div>
              <div className="rounded-md border border-border px-3 py-3">
                <p className="flex items-center gap-1.5 text-caption text-ink-muted">
                  <Warehouse size={13} />
                  Total stock
                </p>
                <p className="mt-1 text-body-lg font-semibold text-ink">
                  {selected.stockQuantity} {selected.unit}
                </p>
              </div>
              <div className="col-span-2 rounded-md border border-border px-3 py-3">
                <p className="flex items-center gap-1.5 text-caption text-ink-muted">
                  <Truck size={13} />
                  Supplier
                </p>
                <p className="mt-1 text-body font-medium text-ink">
                  {selected.supplierNames || "No supplier on file"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <form
              action={submitSearch}
              className="flex items-center gap-2"
            >
              <Input
                autoFocus
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder="Search name, SKU or barcode…"
                className="flex-1"
              />
              <IconButton type="submit" icon={Search} label="Search" />
            </form>

            {searchTerm && query.isPending ? (
              <p className="py-8 text-center text-body text-ink-muted">Searching…</p>
            ) : searchTerm && results.length === 0 ? (
              <p className="py-8 text-center text-body text-ink-muted">
                Nothing matches "{searchTerm}".
              </p>
            ) : results.length > 0 ? (
              <div className="space-y-2">
                <p className="text-caption text-ink-muted">
                  {totalMatches} match{totalMatches === 1 ? "" : "es"}
                </p>
                <div
                  onScroll={onResultsScroll}
                  className="max-h-80 space-y-1 overflow-y-auto"
                >
                  {results.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => setSelected(product)}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-2 text-left transition-colors hover:bg-paper"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-paper">
                          {product.photoUrl ? (
                            <img src={product.photoUrl} alt="" className="size-full object-cover" />
                          ) : (
                            <Camera size={14} strokeWidth={2} className="text-ink-muted" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-body font-medium text-ink">
                            {product.name}
                          </span>
                          <span className="block text-caption text-ink-muted">
                            {product.sku ?? "No SKU"}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-body font-semibold text-ink">
                        <Money value={product.price} />
                      </span>
                    </button>
                  ))}
                  {query.isFetchingNextPage ? (
                    <p className="flex items-center justify-center gap-1.5 py-2 text-caption text-ink-muted">
                      <Loader2 size={13} className="animate-spin" />
                      Loading more…
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="flex flex-col items-center gap-2 py-8 text-center text-body text-ink-muted">
                <Package size={22} strokeWidth={1.75} />
                Search by name, SKU or barcode to see its price.
              </p>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
