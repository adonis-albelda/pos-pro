"use client";

import { useEffect, useMemo, useState } from "react";
import { QrCode } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ProductQrPanel } from "./product-qr-panel";
import { useCategories } from "@/lib/query/categories";
import { useProductLabelsPage } from "@/lib/query/products";
import { toCategoryOptions } from "@/lib/category-options";

const PAGE_SIZE = 50;

export function ProductQrPageClient() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(handle);
  }, [query]);

  // Any filter change starts back at page 1 — a stale page number from a
  // wider result set would otherwise silently show an empty picker.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, categoryId]);

  const categoriesQuery = useCategories({ includeInactive: true });
  const categories = useMemo(
    () =>
      toCategoryOptions(categoriesQuery.data ?? [])
        .map((option) => ({ id: option.id, label: option.path }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categoriesQuery.data],
  );

  const labelsQuery = useProductLabelsPage({
    q: debouncedQuery || undefined,
    categoryId: categoryId === "all" ? undefined : categoryId,
    page,
    pageSize: PAGE_SIZE,
  });

  const pending = labelsQuery.isPending || categoriesQuery.isPending;
  const error = labelsQuery.error ?? categoriesQuery.error;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={QrCode}
        title="Product QR & barcode labels"
        description="Print a sheet of SKU codes for the counter scanner. One page, A4 or Legal."
      />

      {pending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : error ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {error instanceof Error ? error.message : "Could not load products."}
        </Card>
      ) : (labelsQuery.data?.total ?? 0) === 0 && !debouncedQuery && categoryId === "all" ? (
        <Card>
          <EmptyState
            icon={QrCode}
            title="No products with a SKU"
            instruction="Add a SKU on each product first — the code encodes that value."
          />
        </Card>
      ) : (
        <ProductQrPanel
          products={(labelsQuery.data?.labels ?? []).map((product) => ({
            id: product.id,
            sku: product.sku,
            name: product.name,
            category: product.category,
            categoryId: product.categoryId,
          }))}
          categories={categories}
          query={query}
          onQueryChange={setQuery}
          categoryId={categoryId}
          onCategoryChange={setCategoryId}
          page={page}
          pageCount={labelsQuery.data?.lastPage ?? 1}
          total={labelsQuery.data?.total ?? 0}
          onPageChange={setPage}
          pageLoading={labelsQuery.isFetching}
        />
      )}
    </div>
  );
}
