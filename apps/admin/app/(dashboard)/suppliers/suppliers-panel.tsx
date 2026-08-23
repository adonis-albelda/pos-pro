"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Pencil, Truck } from "lucide-react";
import type { Supplier } from "@double-a/shared-types";
import { Badge, Card, EmptyState, IconButton, Money, Table, Td, Th } from "@/components/ui";
import { Sheet } from "@/components/overlay";
import { Pagination, RecordToolbar } from "@/components/record-list";
import { useSupplierProductOptions } from "@/lib/query/suppliers";
import { SupplierForm } from "./supplier-form";

export function SuppliersPanel({
  suppliers,
  balances,
  productIdsBySupplier,
  query,
  page,
  pageCount,
  total,
  pageSize,
}: {
  suppliers: Supplier[];
  balances: Record<string, number>;
  productIdsBySupplier: Record<string, string[]>;
  query: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  // Only fires once a sheet that actually needs it is open — walking the
  // whole product catalogue for a picker nobody has opened yet is what was
  // hitting /products on every visit to this page.
  const productsQuery = useSupplierProductOptions(creating || editing !== null);
  const products = productsQuery.data ?? [];

  return (
    <>
      <Card>
        <RecordToolbar
          searchPlaceholder="Search name, contact, phone…"
          query={query}
          addLabel="Add supplier"
          onAdd={() => setCreating(true)}
        />

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
                        />
                        <Link
                          href={`/suppliers/${supplier.id}` as Route}
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
        open={creating}
        onClose={() => setCreating(false)}
        title="Add a supplier"
        description="Who to order stock from, and what they carry."
        wide
      >
        <SupplierForm products={products} onDone={() => setCreating(false)} />
      </Sheet>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : "Edit supplier"}
        wide
      >
        {editing ? (
          <SupplierForm
            key={editing.id}
            supplier={editing}
            products={products}
            linkedProductIds={productIdsBySupplier[editing.id] ?? []}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
    </>
  );
}
