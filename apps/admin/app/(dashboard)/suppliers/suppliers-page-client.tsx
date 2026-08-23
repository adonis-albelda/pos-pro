"use client";

import { useSearchParams } from "next/navigation";
import { Truck } from "lucide-react";
import type { Supplier } from "@double-a/shared-types";
import { matchesQuery, paginateItems, parseListQuery } from "@/lib/list-query";
import { Card, PageHeader } from "@/components/ui";
import { SuppliersPanel } from "./suppliers-panel";
import { useSupplierBalances, useSuppliers } from "@/lib/query/suppliers";

export function SuppliersPageClient() {
  const searchParams = useSearchParams();
  const { q, page } = parseListQuery({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });

  const suppliersQuery = useSuppliers({ includeInactive: true });
  const balancesQuery = useSupplierBalances();

  const isPending = suppliersQuery.isPending || balancesQuery.isPending;
  const error = suppliersQuery.error ?? balancesQuery.error;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Truck}
        title="Suppliers"
        description="Who the shop buys stock from, what they carry, and what's owed on each order."
      />

      {isPending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : error ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {error instanceof Error ? error.message : "Could not load suppliers."}
        </Card>
      ) : (
        <SuppliersBody
          suppliers={suppliersQuery.data ?? []}
          balances={balancesQuery.data ?? {}}
          q={q}
          page={page}
        />
      )}
    </div>
  );
}

function SuppliersBody({
  suppliers,
  balances,
  q,
  page,
}: {
  suppliers: Supplier[];
  balances: Record<string, number>;
  q: string;
  page: number;
}) {
  const filtered = suppliers.filter((supplier) =>
    matchesQuery([supplier.name, supplier.contactPerson, supplier.phone, supplier.email], q),
  );
  const { pageItems, page: safePage, pageCount, total, pageSize } = paginateItems(
    filtered,
    page,
  );

  // GAP (see lib/query/suppliers.ts / packages/api-client/src/queries/
  // suppliers.ts): SetSupplierProductsController is write-only, no GET reads
  // a supplier's linked product ids back — every edit sheet's picker opens
  // fully unchecked. Preserved as-is from the pre-TanStack Query version.
  const productIdsBySupplier: Record<string, string[]> = {};

  return (
    <SuppliersPanel
      suppliers={pageItems}
      balances={balances}
      productIdsBySupplier={productIdsBySupplier}
      query={q}
      page={safePage}
      pageCount={pageCount}
      total={total}
      pageSize={pageSize}
    />
  );
}
