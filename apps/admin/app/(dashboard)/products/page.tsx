"use client";

import { useSearchParams } from "next/navigation";
import { Package } from "lucide-react";
import { toCategoryOptions } from "@/lib/category-options";
import { DEFAULT_PAGE_SIZE, parseListQuery } from "@/lib/list-query";
import { Card, PageHeader } from "@/components/ui";
import { ProductsPanel } from "./products-panel";
import { useCategories } from "@/lib/query/categories";
import { useProducts } from "@/lib/query/products";
import { useLocationFilter } from "@/components/location-filter-provider";

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const { locationId } = useLocationFilter();
  const { q, page } = parseListQuery({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });

  const categoriesQuery = useCategories({ includeInactive: true });
  const productsQuery = useProducts({
    q,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    includeInactive: true,
    locationId: locationId ?? undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Package}
        title="Products"
        description="Names, prices and categories. Terminals pick these up on their next sync."
      />

      {productsQuery.isPending || categoriesQuery.isPending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : productsQuery.isError || categoriesQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {(() => {
            const error = productsQuery.error ?? categoriesQuery.error;
            return error instanceof Error ? error.message : "Could not load products.";
          })()}
        </Card>
      ) : (
        <ProductsPanel
          products={productsQuery.data?.products ?? []}
          categories={toCategoryOptions(categoriesQuery.data ?? [])}
          query={q}
          page={productsQuery.data?.page ?? page}
          pageCount={productsQuery.data?.pageCount ?? 1}
          total={productsQuery.data?.total ?? 0}
          pageSize={DEFAULT_PAGE_SIZE}
        />
      )}
    </div>
  );
}
