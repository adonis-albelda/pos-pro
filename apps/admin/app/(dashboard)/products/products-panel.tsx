"use client";

import { Package } from "lucide-react";
import type { Product } from "@double-a/shared-types";
import { Card, EmptyState } from "@/components/ui";
import { Pagination, RecordToolbar, SearchField } from "@/components/record-list";
import { ProductsTable } from "./products-table";

export function ProductsPanel({
  products,
  query,
  page,
  pageCount,
  total,
  pageSize,
}: {
  products: Product[];
  query: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 shrink-0">
          <h1 className="text-heading-md font-semibold text-ink">Products</h1>
          <p className="mt-1 max-w-xl text-body text-ink-muted">
            Names, prices and categories. Terminals pick these up on their next sync.
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
          <SearchField
            placeholder="Search name, SKU, barcode…"
            defaultValue={query}
            className="sm:max-w-xs"
          />
          <RecordToolbar
            searchPlaceholder=""
            hideSearch
            embedded
            addLabel="Add product"
            addHref="/products/new"
            exportHref="/api/export/products"
            importHref="/products/import"
          />
        </div>
      </div>

      {total === 0 ? (
        <EmptyState
          icon={Package}
          title={query ? "Nothing matches that search" : "No products yet"}
          instruction={
            query
              ? "Try a different name, SKU or barcode."
              : "Add your first product to start selling."
          }
        />
      ) : (
        <ProductsTable products={products} />
      )}

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        basePath="/products"
        query={{ q: query || undefined }}
      />
    </Card>
  );
}
