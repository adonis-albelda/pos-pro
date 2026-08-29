"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Pencil, Truck } from "lucide-react";
import type { Supplier } from "@double-a/shared-types";
import { Badge, Card, EmptyState, IconButton, Money, Table, Td, Th } from "@/components/ui";
import { Sheet } from "@/components/overlay";
import { Pagination, RecordToolbar, SearchField } from "@/components/record-list";
import { useLocationMutationsLocked } from "@/components/location-mutations-banner";
import { useSupplierProductOptions, useSupplierProducts } from "@/lib/query/suppliers";
import { SupplierForm } from "./supplier-form";

export function SuppliersPanel({
  suppliers,
  balances,
  query,
  page,
  pageCount,
  total,
  pageSize,
}: {
  suppliers: Supplier[];
  balances: Record<string, number>;
  query: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const mutationsLocked = useLocationMutationsLocked();
  const [editing, setEditing] = useState<Supplier | null>(null);

  // Only fires once the edit sheet is actually open — walking the whole
  // product catalogue for a picker nobody has opened yet is what was
  // hitting /products on every visit to this page.
  const productsQuery = useSupplierProductOptions(editing !== null);
  const products = productsQuery.data ?? [];

  // What `editing` is actually linked to right now, so its picker opens
  // pre-checked instead of blank.
  const linkedQuery = useSupplierProducts(editing?.id ?? "", editing !== null);
  const linkedProductIds = (linkedQuery.data ?? []).map((product) => product.id);

  return (
    <>
      <Card>
        <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 shrink-0">
            <h1 className="text-heading-md font-semibold text-ink">Suppliers</h1>
            <p className="mt-1 max-w-xl text-body text-ink-muted">
              Who the shop buys stock from, what they carry, and what's owed on each order.
            </p>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
            <SearchField
              placeholder="Search name, contact, phone…"
              defaultValue={query}
              className="sm:max-w-xs"
            />
            <RecordToolbar
              searchPlaceholder=""
              hideSearch
              embedded
              addLabel="Add supplier"
              addHref="/suppliers/new"
              addDisabled={mutationsLocked}
            />
          </div>
        </div>

        {total === 0 ? (
          <EmptyState
            icon={Truck}
            title={query ? "Nothing matches that search" : "No suppliers yet"}
            instruction={
              query
                ? "Try a different name or contact."
                : "Add a supplier and link the products they carry, then start a purchase order."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Email</Th>
                <Th numeric>Products</Th>
                <Th numeric>Balance owed</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => {
                const balance = balances[supplier.id] ?? 0;
                return (
                  <tr key={supplier.id}>
                    <Td className="font-medium">{supplier.name}</Td>
                    <Td className="text-ink-muted">
                      {[supplier.contactPerson, supplier.phone].filter(Boolean).join(" · ") ||
                        "—"}
                    </Td>
                    <Td className="text-ink-muted">{supplier.email || "—"}</Td>
                    <Td numeric className="text-ink-muted">
                      {supplier.productsCount ?? "—"}
                    </Td>
                    <Td numeric>
                      <Money
                        value={balance}
                        className={balance > 0 ? "font-semibold text-warning-ink" : "text-ink-muted"}
                      />
                    </Td>
                    <Td>
                      {supplier.isActive ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="neutral">Inactive</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <IconButton
                          icon={Pencil}
                          label="Edit supplier"
                          onClick={() => setEditing(supplier)}
                        disabled={mutationsLocked}
                      />
                        <Link
                          href={`/suppliers/${supplier.id}` as Route}
                          prefetch={false}
                          className="inline-flex size-10 items-center justify-center rounded-sm text-ink-muted hover:bg-border/60 hover:text-ink sm:size-8"
                          title="Open supplier"
                          aria-label="Open supplier"
                        >
                          <ChevronRight size={16} strokeWidth={2} />
                        </Link>
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
          basePath="/suppliers"
          query={{ q: query || undefined }}
        />
      </Card>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : "Edit supplier"}
        wide
      >
        {editing && linkedQuery.isPending ? (
          <p className="text-body text-ink-muted">Loading…</p>
        ) : editing ? (
          <SupplierForm
            key={editing.id}
            supplier={editing}
            products={products}
            linkedProductIds={linkedProductIds}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
    </>
  );
}
