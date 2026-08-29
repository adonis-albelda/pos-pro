"use client";

import { useSearchParams } from "next/navigation";
import { CheckCircle2, Users, Wallet } from "lucide-react";
import type { Supplier } from "@double-a/shared-types";
import { formatMoney } from "@double-a/shared-types";
import { matchesQuery, paginateItems, parseListQuery } from "@/lib/list-query";
import { Card, StatCard } from "@/components/ui";
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

  // Company-wide totals, not narrowed by the search box — a snapshot of
  // every supplier on file, same as the list itself before pagination.
  const activeCount = suppliers.filter((supplier) => supplier.isActive).length;
  const totalOwed = Object.values(balances).reduce((sum, balance) => sum + balance, 0);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Total suppliers" value={String(suppliers.length)} />
        <StatCard icon={CheckCircle2} label="Active suppliers" value={String(activeCount)} />
        <StatCard
          icon={Wallet}
          label="Total owed"
          value={formatMoney(totalOwed)}
          tone={totalOwed > 0 ? "warning" : "neutral"}
        />
      </div>

      <SuppliersPanel
        suppliers={pageItems}
        balances={balances}
        query={q}
        page={safePage}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
      />
    </>
  );
}
