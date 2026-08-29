"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Check, Wallet } from "lucide-react";
import {
  EXPENSE_CATEGORY_MAX,
  EXPENSE_DESCRIPTION_MAX,
  EXPENSE_NOTE_MAX,
} from "@double-a/shared-types";
import type { Expense, Location } from "@double-a/shared-types";
import { ConfirmDialog } from "@/components/overlay";
import {
  Button,
  Combobox,
  ErrorNote,
  Field,
  Input,
  MoneyInput,
  SuccessNote,
} from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateExpenses } from "@/lib/query/expenses";
import { removeExpense, saveExpense } from "./actions";

export function ExpenseForm({
  expense,
  locations,
  defaultDate,
  onDone,
}: {
  expense?: Expense;
  locations: Location[];
  /** Shop today, yyyy-mm-dd — used when creating. */
  defaultDate: string;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveExpense, EMPTY_FORM_STATE);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const invalidateExpenses = useInvalidateExpenses();

  useEffect(() => {
    if (state.ok) {
      invalidateExpenses();
      onDone?.();
    }
    // invalidateExpenses is stable enough for this effect; only state.ok/onDone gate re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, onDone]);

  function confirmRemove() {
    if (!expense) return;
    const form = new FormData();
    form.set("id", expense.id);
    startDelete(async () => {
      await removeExpense(form);
      invalidateExpenses();
      setConfirmDelete(false);
      onDone?.();
    });
  }

  return (
    <>
      <form action={action} className="space-y-4">
        {expense ? <input type="hidden" name="id" value={expense.id} /> : null}

        <Field label="Description" required>
          <Input
            name="description"
            defaultValue={expense?.description}
            required
            maxLength={EXPENSE_DESCRIPTION_MAX}
            placeholder="Electric bill, rent, delivery fuel…"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" required>
            <MoneyInput
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              defaultValue={expense?.amount}
              required
            />
          </Field>
          <Field label="Date" hint="Shop day this expense belongs to." required>
            <Input
              name="expense_date"
              type="date"
              defaultValue={expense?.expenseDate ?? defaultDate}
              required
            />
          </Field>
        </div>

        <Field label="Category" hint="Optional — rent, wages, utilities…" required={false}>
          <Input
            name="category"
            defaultValue={expense?.category ?? ""}
            maxLength={EXPENSE_CATEGORY_MAX}
          />
        </Field>

        <Field label="Note" required={false}>
          <Input
            name="note"
            defaultValue={expense?.note ?? ""}
            maxLength={EXPENSE_NOTE_MAX}
          />
        </Field>

        <Field
          label="Branch"
          hint="Optional — leave as company-wide for rent, wages, or anything not tied to one branch."
          required={false}
        >
          <Combobox
            name="location_id"
            defaultValue={expense?.locationId ?? ""}
            placeholder="Company-wide"
            options={[
              { value: "", label: "Company-wide" },
              ...locations.map((location) => ({ value: location.id, label: location.name })),
            ]}
          />
        </Field>

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
        {state.ok ? <SuccessNote>Saved.</SuccessNote> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button
            type="submit"
            loading={pending}
            icon={expense ? Check : Wallet}
            className="w-full sm:w-auto"
          >
            {pending ? "Saving..." : expense ? "Save changes" : "Add expense"}
          </Button>
          {onDone ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={onDone}
            >
              Cancel
            </Button>
          ) : null}
          {expense ? (
            <button
              type="button"
              className="text-body text-danger hover:underline sm:ml-auto"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          ) : null}
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={confirmRemove}
        pending={deleting}
        title="Delete expense?"
        description="This removes it from the books and from today's net. Cannot be undone."
        confirmLabel="Delete expense"
      />
    </>
  );
}
