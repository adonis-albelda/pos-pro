"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@double-a/shared-types";
import type { Expense, Location } from "@double-a/shared-types";
import { Card, EmptyState, IconButton, Money, Table, Td, Th } from "@/components/ui";
import { ConfirmDialog, Sheet } from "@/components/overlay";
import { Pagination, RecordToolbar } from "@/components/record-list";
import { useLocationMutationsLocked } from "@/components/location-mutations-banner";
import { formatStoreDay } from "@/lib/date-range";
import { useInvalidateExpenses } from "@/lib/query/expenses";
import { ExpenseForm } from "./expense-form";
import { removeExpense } from "./actions";

export function ExpensesPanel({
  expenses,
  locations,
  defaultDate,
  query,
  page,
  pageCount,
  total,
  pageSize,
}: {
  expenses: Expense[];
  locations: Location[];
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
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [removing, startRemove] = useTransition();
  const invalidateExpenses = useInvalidateExpenses();
  const locationsById = new Map(locations.map((location) => [location.id, location.name]));

  function confirmDelete() {
    if (!deleting) return;
    const form = new FormData();
    form.set("id", deleting.id);
    startRemove(async () => {
      await removeExpense(form);
      invalidateExpenses();
      toast.success("Expense deleted.");
      setDeleting(null);
    });
  }

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
                <Th>Branch</Th>
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
                  <Td className="text-ink-muted">
                    {expense.locationId
                      ? (locationsById.get(expense.locationId) ?? "—")
                      : "Company-wide"}
                  </Td>
                  <Td numeric>
                    <Money value={expense.amount} />
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <IconButton
                        icon={Pencil}
                        label={`Edit ${formatMoney(expense.amount)} expense`}
                        onClick={() => setEditing(expense)}
                        disabled={mutationsLocked}
                      />
                      <IconButton
                        icon={Trash2}
                        label={`Delete ${formatMoney(expense.amount)} expense`}
                        tone="danger"
                        onClick={() => setDeleting(expense)}
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
        className="max-w-3xl"
      >
        <ExpenseForm
          locations={locations}
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
            locations={locations}
            defaultDate={defaultDate}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={removing}
        title="Delete expense?"
        description="This removes it from the books and from today's net. Cannot be undone."
        confirmLabel="Delete expense"
        confirmationText={deleting?.description ?? ""}
      />
    </>
  );
}
