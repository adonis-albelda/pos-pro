"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { FilterX, History, PackagePlus, Warehouse } from "lucide-react";
import type { Product } from "@double-a/shared-types";
import { stockLevel } from "@double-a/shared-types";
import {
  Badge,
  Button,
  Card,
  IconButton,
  IconLink,
  Money,
  Select,
  Table,
  Td,
  Th,
  EmptyState,
} from "@/components/ui";
import { Pagination, RecordToolbar } from "@/components/record-list";
import { useLocationMutationsLocked } from "@/components/location-mutations-banner";
import { indentLabel, type CategoryOption } from "@/lib/category-options";
import { RestockSheet } from "./restock-sheet";
import {
  STOCK_SORTS,
  STOCK_SORT_LABELS,
  STOCK_STATES,
  STOCK_STATE_LABELS,
  type StockSort,
  type StockState,
} from "./view-options";

export function StockPanel({
  products,
  categories,
  query,
  state,
  sort,
  category,
  page,
  pageCount,
  total,
  pageSize,
  focusedProduct,
  fetching = false,
}: {
  products: Product[];
  categories: CategoryOption[];
  query: string;
  state: StockState;
  sort: StockSort;
  category?: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  focusedProduct?: string;
  fetching?: boolean;
}) {
  const mutationsLocked = useLocationMutationsLocked();
  const router = useRouter();
  const search = useSearchParams();
  // A product link from the dashboard lands here with the panel already open.
  const [restocking, setRestocking] = useState<{ productId?: string } | null>(
    focusedProduct ? { productId: focusedProduct } : null,
  );

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(search.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Any filter change puts you back on the first page of the new result.
    next.delete("page");
    const qs = next.toString();
    router.push((qs ? `/inventory?${qs}` : "/inventory") as Route);
  }

  const filtered = state !== "all" || Boolean(category) || Boolean(query);
  const preserve = {
    state: state === "all" ? undefined : state,
    category,
    sort: sort === "name" ? undefined : sort,
  };

  return (
    <>
      <Card>
        <RecordToolbar
          searchPlaceholder="Search products…"
          query={query}
          addLabel="Restock or adjust"
          onAdd={() => setRestocking({})}
          addDisabled={mutationsLocked}
          exportHref="/api/export/valuation"
          preserve={preserve}
        />

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
            <Select
              value={category ?? ""}
              onChange={(event) => setParam("category", event.target.value)}
            >
              <option value="">Every category</option>
              {categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {indentLabel(option)}
                </option>
              ))}
            </Select>
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

        {total === 0 ? (
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
          <Table fetching={fetching}>
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
        )}

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          basePath="/inventory"
          query={{ q: query || undefined, ...preserve }}
        />
      </Card>

      <RestockSheet
        open={restocking !== null}
        onClose={() => setRestocking(null)}
        defaultProductId={restocking?.productId}
      />
    </>
  );
}
