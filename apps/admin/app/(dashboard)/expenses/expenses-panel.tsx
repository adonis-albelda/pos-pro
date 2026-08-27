"use client";

import { useState } from "react";
import { Pencil, Wallet } from "lucide-react";
import { formatMoney } from "@double-a/shared-types";
import type { Expense } from "@double-a/shared-types";
import { Card, EmptyState, IconButton, Money, Table, Td, Th } from "@/components/ui";
import { Sheet } from "@/components/overlay";
import { Pagination, RecordToolbar } from "@/components/record-list";
import { useLocationMutationsLocked } from "@/components/location-mutations-banner";
import { formatStoreDay } from "@/lib/date-range";
import { ExpenseForm } from "./expense-form";

export function ExpensesPanel({
  expenses,
  defaultDate,
  query,
  page,
  pageCount,
  total,
  pageSize,
}: {
  expenses: Expense[];
  defaultDate: string;
  query: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const mutationsLocked = useLocationMutationsLocked();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  return (
    <>
      <Card>
        <RecordToolbar
          searchPlaceholder="Search description, category, note…"
          query={query}
          addLabel="Add expense"
          onAdd={() => setCreating(true)}
          addDisabled={mutationsLocked}
        />

        {total === 0 ? (
          <EmptyState
            icon={Wallet}
            title={query ? "Nothing matches that search" : "No expenses yet"}
            instruction={
              query
                ? "Try a different word."
                : "Log rent, utilities, wages and other outlays. Dashboard subtracts them from revenue."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th numeric>Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <Td className="whitespace-nowrap num">
                    {formatStoreDay(expense.expenseDate)}
                  </Td>
                  <Td>
                    <div className="font-medium">{expense.description}</div>
                    {expense.note ? (
                      <div className="mt-0.5 text-caption text-ink-muted">
                        {expense.note}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="text-ink-muted">{expense.category ?? "—"}</Td>
                  <Td numeric>
                    <Money value={expense.amount} />
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton
                        icon={Pencil}
                        label={`Edit ${formatMoney(expense.amount)} expense`}
                        onClick={() => setEditing(expense)}
                      disabled={mutationsLocked}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          basePath="/expenses"
          query={{ q: query || undefined }}
        />
      </Card>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="Add an expense"
        description="Counts against revenue on the date you pick."
      >
        <ExpenseForm
          defaultDate={defaultDate}
          onDone={() => setCreating(false)}
        />
      </Sheet>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.description}` : "Edit expense"}
      >
        {editing ? (
          <ExpenseForm
            key={editing.id}
            expense={editing}
            defaultDate={defaultDate}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
    </>
  );
}
