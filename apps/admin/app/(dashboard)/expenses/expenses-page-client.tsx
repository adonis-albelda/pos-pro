"use client";

import { useSearchParams } from "next/navigation";
import { Wallet } from "lucide-react";
import type { Expense, ExpenseBill, Location } from "@double-a/shared-types";
import { matchesQuery, paginateItems, parseListQuery } from "@/lib/list-query";
import { storeToday } from "@/lib/date-range";
import { Card, PageHeader } from "@/components/ui";
import { useLocationFilter } from "@/components/location-filter-provider";
import { useLocations } from "@/lib/query/locations";
import { ExpensesPanel } from "./expenses-panel";
import { ExpenseBillsPanel } from "./expense-bills-panel";
import { ExpenseForecast } from "./expense-forecast";
import { useExpenses } from "@/lib/query/expenses";
import { useExpenseBills } from "@/lib/query/expense-bills";

export function ExpensesPageClient() {
  const searchParams = useSearchParams();
  const { locationId } = useLocationFilter();
  const { q, page } = parseListQuery({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });

  const expensesQuery = useExpenses(undefined, { locationId: locationId ?? undefined });
  const billsQuery = useExpenseBills();
  const locationsQuery = useLocations({ includeInactive: false });

  const loading = expensesQuery.isPending || billsQuery.isPending;
  const error = expensesQuery.isError
    ? expensesQuery.error
    : billsQuery.isError
      ? billsQuery.error
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Wallet}
        title="Expenses"
        description="Ledger outlays, recurring bills with reminders, and a spend forecast. Net is revenue minus ledger only."
      />

      {loading ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : error ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {error instanceof Error ? error.message : "Could not load expenses."}
        </Card>
      ) : (
        <ExpensesBody
          expenses={expensesQuery.data ?? []}
          bills={billsQuery.data ?? []}
          locations={locationsQuery.data ?? []}
          q={q}
          page={page}
        />
      )}
    </div>
  );
}

function ExpensesBody({
  expenses,
  bills,
  locations,
  q,
  page,
}: {
  expenses: Expense[];
  bills: ExpenseBill[];
  locations: Location[];
  q: string;
  page: number;
}) {
  const today = storeToday();
  const filtered = expenses.filter((expense) =>
    matchesQuery([expense.description, expense.category, expense.note], q),
  );
  const { pageItems, page: safePage, pageCount, total, pageSize } = paginateItems(filtered, page);

  return (
    <>
      <ExpenseForecast expenses={expenses} bills={bills} today={today} />
      <ExpenseBillsPanel bills={bills} defaultDueDate={today} />
      <ExpensesPanel
        expenses={pageItems}
        locations={locations}
        defaultDate={today}
        query={q}
        page={safePage}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
      />
    </>
  );
}
