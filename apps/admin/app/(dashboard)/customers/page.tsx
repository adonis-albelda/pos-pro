"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import type { Customer, SaleWithItems } from "@double-a/shared-types";
import { listSales } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "@/lib/query/keys";
import { useCustomerBalances, useCustomers } from "@/lib/query/customers";
import { matchesQuery, paginateItems, parseListQuery } from "@/lib/list-query";
import { Card, PageHeader } from "@/components/ui";
import { CustomersPanel } from "./customers-panel";

export default function CustomersPage() {
  const searchParams = useSearchParams();
  const { q, page } = parseListQuery({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });

  const customersQuery = useCustomers();
  const balancesQuery = useCustomerBalances();

  // Sale counts in one pass rather than N+1. GAP: `IndexSalesController` caps
  // `per_page` at 200 server-side and `listSales` only walks page 1 (see
  // queries/sales.ts), so a shop with more than 200 sales on record will only
  // have its most recent 200 reflected in these per-customer counts — the old
  // PostgREST query's `limit: 2000` had no such server-side ceiling.
  const salesQuery = useQuery({
    queryKey: queryKeys.sales.list({ limit: 2000 }),
    queryFn: () => listSales(getBrowserApiClient(), { limit: 2000 }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Customers"
        description="Reusable accounts linked from the counter. Every sale still keeps its own name snapshot."
      />

      {customersQuery.isPending || salesQuery.isPending || balancesQuery.isPending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : customersQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {customersQuery.error instanceof Error
            ? customersQuery.error.message
            : "Could not load customers."}
        </Card>
      ) : (
        <CustomersBody
          customers={customersQuery.data ?? []}
          sales={salesQuery.data ?? []}
          balances={balancesQuery.data ?? {}}
          q={q}
          page={page}
        />
      )}
    </div>
  );
}

function CustomersBody({
  customers,
  sales,
  balances,
  q,
  page,
}: {
  customers: Customer[];
  sales: SaleWithItems[];
  balances: Record<string, number>;
  q: string;
  page: number;
}) {
  const saleCounts: Record<string, number> = {};
  for (const sale of sales) {
    if (!sale.customerId) continue;
    saleCounts[sale.customerId] = (saleCounts[sale.customerId] ?? 0) + 1;
  }

  const filtered = customers.filter((customer) =>
    matchesQuery([customer.name, customer.contact, customer.address], q),
  );
  const { pageItems, page: safePage, pageCount, total, pageSize } = paginateItems(
    filtered,
    page,
  );

  return (
    <CustomersPanel
      customers={pageItems}
      saleCounts={saleCounts}
      balances={balances}
      query={q}
      page={safePage}
      pageCount={pageCount}
      total={total}
      pageSize={pageSize}
    />
  );
}
