"use client";

import { useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FilterX, History, Loader2, PackagePlus, Warehouse } from "lucide-react";
import { listProductsPage } from "@double-a/api-client/queries";
import { stockLevel } from "@double-a/shared-types";
import {
  Badge,
  Button,
  Card,
  Combobox,
  IconButton,
  IconLink,
  Money,
  Select,
  Table,
  Td,
  Th,
  EmptyState,
} from "@/components/ui";
import { RecordToolbar, SearchField } from "@/components/record-list";
import { useLocationMutationsLocked } from "@/components/location-mutations-banner";
import { useLocationFilter } from "@/components/location-filter-provider";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { indentLabel, type CategoryOption } from "@/lib/category-options";
import { queryKeys } from "@/lib/query/keys";
import { RestockSheet } from "./restock-sheet";
import {
  STOCK_SORTS,
  STOCK_SORT_LABELS,
  STOCK_STATES,
  STOCK_STATE_LABELS,
  type StockSort,
  type StockState,
} from "./view-options";

const STOCK_PAGE_SIZE = 25;
/** Fetch the next page once the scrolled-past distance from the bottom is under this. */
const LOAD_MORE_THRESHOLD_PX = 300;

export function StockPanel({
  categories,
  query,
  state,
  sort,
  category,
  focusedProduct,
}: {
  categories: CategoryOption[];
  query: string;
  state: StockState;
  sort: StockSort;
  category?: string;
  focusedProduct?: string;
}) {
  const mutationsLocked = useLocationMutationsLocked();
  const router = useRouter();
  const search = useSearchParams();
  const { locationId } = useLocationFilter();
  // A product link from the dashboard lands here with the panel already open.
  const [restocking, setRestocking] = useState<{ productId?: string } | null>(
    focusedProduct ? { productId: focusedProduct } : null,
  );

  const stateFilter = state === "all" ? undefined : state;
  const sortFilter = sort === "name" ? undefined : sort;

  // Infinite scroll, not a page-number Pagination control — the table sits
  // in normal page flow (no fixed-height scroll box of its own), so the
  // trigger watches window scroll and fetches the next 25-row page once
  // near the bottom. Filter changes (q/state/category/sort/location) key a
  // fresh query, so switching filters starts back at page 1 automatically.
  const stockQuery = useInfiniteQuery({
    queryKey: queryKeys.products.list({
      q: query || undefined,
      categoryId: category,
      state: stateFilter,
      sort: sortFilter,
      locationId: locationId ?? undefined,
      infinite: true,
    }),
    queryFn: ({ pageParam }) =>
      listProductsPage(getBrowserApiClient(), {
        q: query || undefined,
        categoryId: category,
        state: stateFilter,
        sort: sortFilter,
        includeInactive: true,
        locationId: locationId ?? undefined,
        page: pageParam,
        pageSize: STOCK_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length < lastPage.lastPage ? allPages.length + 1 : undefined,
  });

  const products = stockQuery.data?.pages.flatMap((page) => page.products) ?? [];
  const total = stockQuery.data?.pages[0]?.total ?? 0;

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry?.isIntersecting &&
          stockQuery.hasNextPage &&
          !stockQuery.isFetchingNextPage
        ) {
          void stockQuery.fetchNextPage();
        }
      },
      { rootMargin: `${LOAD_MORE_THRESHOLD_PX}px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // stockQuery is a fresh object every render; the callback reads its
    // current closure values directly rather than needing them as deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockQuery.hasNextPage, stockQuery.isFetchingNextPage]);

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(search.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.push((qs ? `/inventory?${qs}` : "/inventory") as Route);
  }

  const filtered = state !== "all" || Boolean(category) || Boolean(query);
  const preserve = {
    state: stateFilter,
    category,
    sort: sortFilter,
  };

  return (
    <>
      <Card>
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 shrink-0 items-center gap-3">
              <h1 className="shrink-0 text-heading-md font-semibold text-ink">Inventory</h1>
              <SearchField
                placeholder="Search products…"
                defaultValue={query}
                preserve={preserve}
                className="w-64"
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <RecordToolbar
                searchPlaceholder=""
                hideSearch
                embedded
                addLabel="Restock or adjust"
                onAdd={() => setRestocking({})}
                addDisabled={mutationsLocked}
                exportHref="/api/export/valuation"
                preserve={preserve}
              />
            </div>
          </div>

          <p className="max-w-xl text-body text-ink-muted">
            Stock changes are recorded as movements, never edited directly.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-end sm:px-6">
          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-caption font-medium text-ink-muted">
              Show
            </span>
            <Select
              value={state}
              onChange={(event) => setParam("state", event.target.value)}
            >
              {STOCK_STATES.map((option) => (
                <option key={option} value={option}>
                  {STOCK_STATE_LABELS[option]}
                </option>
              ))}
            </Select>
          </label>

          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-caption font-medium text-ink-muted">
              Category
            </span>
            <Combobox
              value={category ?? ""}
              onChange={(next) => setParam("category", next)}
              placeholder="Every category"
              options={[
                { value: "", label: "Every category" },
                ...categories.map((option) => ({ value: option.id, label: indentLabel(option) })),
              ]}
            />
          </label>

          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-caption font-medium text-ink-muted">
              Sort by
            </span>
            <Select
              value={sort}
              onChange={(event) => setParam("sort", event.target.value)}
            >
              {STOCK_SORTS.map((option) => (
                <option key={option} value={option}>
                  {STOCK_SORT_LABELS[option]}
                </option>
              ))}
            </Select>
          </label>

          {filtered ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={FilterX}
              onClick={() => router.push("/inventory")}
            >
              Clear
            </Button>
          ) : null}
        </div>

        {stockQuery.isPending ? (
          <p className="px-4 py-8 text-center text-body text-ink-muted sm:px-6">Loading…</p>
        ) : stockQuery.isError ? (
          <p className="px-4 py-8 text-center text-body text-danger sm:px-6">
            {stockQuery.error instanceof Error
              ? stockQuery.error.message
              : "Could not load inventory."}
          </p>
        ) : total === 0 ? (
          <EmptyState
            icon={Warehouse}
            title={filtered ? "Nothing matches those filters" : "No products yet"}
            instruction={
              filtered
                ? "Widen the search, or show all products."
                : "Add a product first, then record its opening stock here."
            }
            action={
              filtered ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon={FilterX}
                  onClick={() => router.push("/inventory")}
                >
                  Clear filters
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <Table fetching={stockQuery.isFetching && !stockQuery.isFetchingNextPage}>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>SKU</Th>
                  <Th numeric>On hand</Th>
                  <Th numeric>Reorder at</Th>
                  <Th numeric>At cost</Th>
                  <Th>State</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const level = stockLevel(product.stockQuantity, product.reorderPoint);
                  const oversold = product.stockQuantity < 0;
                  const shortBy = product.reorderPoint - product.stockQuantity;

                  return (
                    <tr key={product.id} className={product.isActive ? "" : "opacity-60"}>
                      <Td className="font-medium">
                        {product.name}
                        {product.category ? (
                          <span className="mt-0.5 block text-caption font-normal text-ink-muted">
                            {product.category}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="num text-ink-muted">{product.sku ?? "—"}</Td>
                      <Td
                        numeric
                        className={oversold ? "font-semibold text-danger" : "font-medium"}
                      >
                        {product.stockQuantity}
                        <span className="mt-0.5 block text-caption font-normal text-ink-muted">
                          {product.unit}
                        </span>
                      </Td>
                      <Td numeric className="text-ink-muted">
                        {product.reorderPoint}
                        {shortBy > 0 && product.isActive ? (
                          <span className="mt-0.5 block text-caption text-warning-ink">
                            {shortBy} short
                          </span>
                        ) : null}
                      </Td>
                      <Td numeric className="text-ink-muted">
                        <Money
                          value={product.costPrice * Math.max(0, product.stockQuantity)}
                        />
                      </Td>
                      <Td>
                        {!product.isActive ? (
                          <Badge tone="neutral">Hidden</Badge>
                        ) : oversold ? (
                          <Badge tone="danger">Oversold</Badge>
                        ) : level === "out" ? (
                          <Badge tone="danger">Out of stock</Badge>
                        ) : level === "low" ? (
                          <Badge tone="warning">Low stock</Badge>
                        ) : (
                          <Badge tone="success">In stock</Badge>
                        )}
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <IconButton
                            icon={PackagePlus}
                            label={`Restock or adjust ${product.name}`}
                            tone="primary"
                            onClick={() => setRestocking({ productId: product.id })}
                          disabled={mutationsLocked}
                        />
                          <IconLink
                            icon={History}
                            label={`Movement history for ${product.name}`}
                            href={`/inventory?tab=movements&product=${product.id}`}
                          />
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>

            <div ref={sentinelRef} className="h-px" aria-hidden />

            <div className="flex items-center justify-center gap-2 border-t border-border px-4 py-3 text-caption text-ink-muted sm:px-6">
              {stockQuery.isFetchingNextPage ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Loading more…
                </>
              ) : (
                `Showing ${products.length} of ${total}`
              )}
            </div>
          </>
        )}
      </Card>

      <RestockSheet
        open={restocking !== null}
        onClose={() => setRestocking(null)}
        defaultProductId={restocking?.productId}
      />
    </>
  );
}
