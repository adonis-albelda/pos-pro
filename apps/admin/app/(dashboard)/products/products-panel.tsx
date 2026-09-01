"use client";

import { Package, Trash2 } from "lucide-react";
import type { Product } from "@double-a/shared-types";
import { Card, EmptyState } from "@/components/ui";
import { Pagination, RecordToolbar, SearchField } from "@/components/record-list";
import { ProductsFiltersPopover } from "./products-filters";
import { ProductsTable } from "./products-table";

export function ProductsPanel({
  products,
  query,
  page,
  pageCount,
  total,
  pageSize,
  fetching = false,
  trashed = false,
}: {
  products: Product[];
  query: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  fetching?: boolean;
  trashed?: boolean;
}) {
  return (
    <Card>
      <div className="space-y-1 border-b border-border px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <h1 className="shrink-0 text-heading-md font-semibold text-ink">Products</h1>
            <SearchField
              placeholder="Search name, SKU, barcode…"
              defaultValue={query}
              preserve={{ trashed: trashed ? "only" : undefined }}
              className="w-80"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <ProductsFiltersPopover className="sm:max-w-xs" />
            {trashed ? null : (
              <RecordToolbar
                searchPlaceholder=""
                hideSearch
                embedded
                addLabel="Add product"
                addHref="/products/new"
                exportHref="/api/export/products"
                importHref="/products/import"
              />
            )}
          </div>
        </div>

        <p className="max-w-xl text-body text-ink-muted">
          {trashed
            ? "Deleted products — restore one to bring it back."
            : "Names, prices and categories. Terminals pick these up on their next sync."}
        </p>
      </div>

      {total === 0 ? (
        <EmptyState
          icon={trashed ? Trash2 : Package}
          title={
            query ? "Nothing matches that search" : trashed ? "Nothing deleted" : "No products yet"
          }
          instruction={
            query
              ? "Try a different name, SKU or barcode."
              : trashed
                ? "Products you delete show up here until restored."
                : "Add your first product to start selling."
          }
        />
      ) : (
        <ProductsTable products={products} fetching={fetching} trashed={trashed} />
      )}

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        basePath="/products"
        query={{ q: query || undefined, trashed: trashed ? "only" : undefined }}
      />
    </Card>
  );
}
