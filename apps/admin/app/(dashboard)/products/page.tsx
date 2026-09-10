"use client";

import { useSearchParams } from "next/navigation";
import { EyeOff, Package, PackageX, TriangleAlert } from "lucide-react";
import type { ProductSort, ProductStockState } from "@double-a/api-client/queries";
import { DEFAULT_PAGE_SIZE, isInitialQueryLoad, parseListQuery } from "@/lib/list-query";
import { Card, StatCard, StatCardSkeleton, TableSkeleton } from "@/components/ui";
import { ProductsPanel } from "./products-panel";
import { useProducts, useProductStats, useProductVariantsList } from "@/lib/query/products";
import { useLocationFilter } from "@/components/location-filter-provider";

/** Default view is one row per variant — "Products" is the opt-in rollup. */
type ProductsView = "variants" | "products";

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
  const view: ProductsView = searchParams.get("view") === "products" ? "products" : "variants";

  const statsQuery = useProductStats({ locationId: locationId ?? undefined });
  const sharedOptions = {
    q,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    includeInactive: true,
    locationId: locationId ?? undefined,
    trashed: trashed ? ("only" as const) : undefined,
    state,
    sort,
  };
  const productsQuery = useProducts(sharedOptions, { enabled: view === "products" });
  const variantsQuery = useProductVariantsList(sharedOptions, { enabled: view === "variants" });
  const activeQuery = view === "products" ? productsQuery : variantsQuery;

  // Stats are whole-catalogue figures — meaningless once viewing the trash,
  // so skip that query's loading/error state from gating this view.
  const pending = trashed
    ? isInitialQueryLoad(activeQuery.isPending, Boolean(activeQuery.data))
    : isInitialQueryLoad(activeQuery.isPending, Boolean(activeQuery.data)) || statsQuery.isPending;
  const isError = activeQuery.isError || (!trashed && statsQuery.isError);
  const error = activeQuery.error ?? (trashed ? undefined : statsQuery.error);

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
        <>
          {trashed ? null : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <StatCardSkeleton key={index} />
              ))}
            </div>
          )}
          <TableSkeleton
            columns={["w-40", "w-20", "w-24", "w-24", "w-16", "w-16", "w-16", "w-12", "w-12", "w-16", ""]}
            rows={8}
          />
        </>
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
            view={view}
            products={productsQuery.data?.products ?? []}
            variants={variantsQuery.data?.variants ?? []}
            query={q}
            page={activeQuery.data?.page ?? page}
            pageCount={activeQuery.data?.pageCount ?? 1}
            total={activeQuery.data?.total ?? 0}
            pageSize={DEFAULT_PAGE_SIZE}
            fetching={activeQuery.isFetching && Boolean(activeQuery.data)}
            trashed={trashed}
          />
        </>
      )}
    </div>
  );
}
