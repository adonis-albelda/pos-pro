"use client";

import { useSearchParams } from "next/navigation";
import { EyeOff, Package, PackageX, TriangleAlert } from "lucide-react";
import type { ProductSort, ProductStockState } from "@double-a/api-client/queries";
import { DEFAULT_PAGE_SIZE, isInitialQueryLoad, parseListQuery } from "@/lib/list-query";
import { Card, StatCard } from "@/components/ui";
import { ProductsPanel } from "./products-panel";
import { useProducts, useProductStats } from "@/lib/query/products";
import { useLocationFilter } from "@/components/location-filter-provider";

const PRODUCT_STATES: ProductStockState[] = ["attention", "low", "out", "oversold", "healthy", "hidden"];
const PRODUCT_SORTS: ProductSort[] = [
  "price-asc",
  "price-desc",
  "stock-asc",
  "stock-desc",
  "short-desc",
  "value-desc",
];

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const { locationId } = useLocationFilter();
  const { q, page } = parseListQuery({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });
  const trashed = searchParams.get("trashed") === "only";
  const stateParam = searchParams.get("state") ?? "";
  const sortParam = searchParams.get("sort") ?? "";
  const state = PRODUCT_STATES.find((entry) => entry === stateParam);
  const sort = PRODUCT_SORTS.find((entry) => entry === sortParam);

  const statsQuery = useProductStats({ locationId: locationId ?? undefined });
  const productsQuery = useProducts({
    q,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    includeInactive: true,
    locationId: locationId ?? undefined,
    trashed: trashed ? "only" : undefined,
    state,
    sort,
  });

  // Stats are whole-catalogue figures — meaningless once viewing the trash,
  // so skip that query's loading/error state from gating this view.
  const pending = trashed
    ? isInitialQueryLoad(productsQuery.isPending, Boolean(productsQuery.data))
    : isInitialQueryLoad(productsQuery.isPending, Boolean(productsQuery.data)) ||
      statsQuery.isPending;
  const isError = productsQuery.isError || (!trashed && statsQuery.isError);
  const error = productsQuery.error ?? (trashed ? undefined : statsQuery.error);

  const stats = statsQuery.data ?? {
    total: 0,
    tracked: 0,
    stockCost: 0,
    needsReordering: 0,
    lowStock: 0,
    outOfStock: 0,
    oversold: 0,
    hidden: 0,
  };

  const locationHint = locationId ? "Counts for the selected branch" : "Company-wide stock totals";

  return (
    <div className="space-y-6">
      {pending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {error instanceof Error ? error.message : "Could not load products."}
        </Card>
      ) : (
        <>
          {trashed ? null : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={Package}
                label="Total products"
                value={String(stats.total)}
                hint={locationHint}
              />
              <StatCard
                icon={PackageX}
                label="Out of stock"
                value={String(stats.outOfStock)}
                hint="Active products with zero or negative stock"
                tone={stats.outOfStock > 0 ? "danger" : "neutral"}
              />
              <StatCard
                icon={TriangleAlert}
                label="Low stock"
                value={String(stats.lowStock)}
                hint="Above zero but at or below reorder point"
                tone={stats.lowStock > 0 ? "warning" : "neutral"}
              />
              <StatCard
                icon={EyeOff}
                label="Hidden"
                value={String(stats.hidden)}
                hint="Not shown on terminals"
                tone={stats.hidden > 0 ? "neutral" : "success"}
              />
            </div>
          )}

          <ProductsPanel
            products={productsQuery.data?.products ?? []}
            query={q}
            page={productsQuery.data?.page ?? page}
            pageCount={productsQuery.data?.pageCount ?? 1}
            total={productsQuery.data?.total ?? 0}
            pageSize={DEFAULT_PAGE_SIZE}
            fetching={productsQuery.isFetching && Boolean(productsQuery.data)}
            trashed={trashed}
          />
        </>
      )}
    </div>
  );
}
