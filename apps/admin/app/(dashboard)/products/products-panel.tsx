"use client";

import type { Route } from "next";
import Link from "next/link";
import { Package, Trash2 } from "lucide-react";
import type { Product } from "@double-a/shared-types";
import { Card, EmptyState } from "@/components/ui";
import { Pagination, RecordToolbar, SearchField } from "@/components/record-list";
import { ProductsFiltersPopover } from "./products-filters";
import { ProductsTable } from "./products-table";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Active/Deleted toggle — the only filter this view needs (per-field filters don't apply to a trash list). */
function TrashedToggle({ trashed, query }: { trashed: boolean; query: string }) {
  const qs = query ? `?q=${encodeURIComponent(query)}` : "";
  const tabClass = (active: boolean) =>
    cx(
      "flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-caption font-medium transition-colors",
      active ? "bg-primary/10 text-primary" : "text-ink-muted hover:text-ink",
    );

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-paper p-1">
      <Link href={(`/products${qs}`) as Route} className={tabClass(!trashed)}>
        Active
      </Link>
      <Link
        href={(`/products${qs}${qs ? "&" : "?"}trashed=only`) as Route}
        className={tabClass(trashed)}
      >
        <Trash2 size={13} strokeWidth={2} />
        Deleted
      </Link>
    </div>
  );
}

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
      <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 shrink-0">
          <h1 className="text-heading-md font-semibold text-ink">Products</h1>
          <p className="mt-1 max-w-xl text-body text-ink-muted">
            {trashed
              ? "Deleted products — restore one to bring it back."
              : "Names, prices and categories. Terminals pick these up on their next sync."}
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
          <SearchField
            placeholder="Search name, SKU, barcode…"
            defaultValue={query}
            preserve={{ trashed: trashed ? "only" : undefined }}
            className="sm:max-w-xs"
          />
          <TrashedToggle trashed={trashed} query={query} />
          {trashed ? null : <ProductsFiltersPopover className="sm:max-w-xs" />}
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
