"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CalendarClock, Check, Trash2 } from "lucide-react";
import {
  EXPENSE_BILL_FREQUENCIES,
  EXPENSE_BILL_REMIND_DAYS_MAX,
  EXPENSE_CATEGORY_MAX,
  EXPENSE_DESCRIPTION_MAX,
  EXPENSE_NOTE_MAX,
  type ExpenseBill,
} from "@double-a/shared-types";
import { ConfirmDialog } from "@/components/overlay";
import { Button, ErrorNote, Field, Input, MoneyInput, Select, SuccessNote } from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateExpenseBills } from "@/lib/query/expense-bills";
import { removeExpenseBill, saveExpenseBill } from "./bill-actions";

const FREQUENCY_LABELS: Record<(typeof EXPENSE_BILL_FREQUENCIES)[number], string> = {
  once: "Once",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function ExpenseBillForm({
  bill,
  defaultDueDate,
  onDone,
}: {
  bill?: ExpenseBill;
  defaultDueDate: string;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveExpenseBill, EMPTY_FORM_STATE);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const invalidate = useInvalidateExpenseBills();

  useEffect(() => {
    if (state.ok) {
      invalidate();
      onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, onDone]);

  function confirmRemove() {
    if (!bill) return;
    const form = new FormData();
    form.set("id", bill.id);
    startDelete(async () => {
      await removeExpenseBill(form);
      invalidate();
      setConfirmDelete(false);
      onDone?.();
    });
  }

  return (
    <>
      <form action={action} className="space-y-4">
        {bill ? <input type="hidden" name="id" value={bill.id} /> : null}

        <Field label="Description" required>
          <Input
            name="description"
            defaultValue={bill?.description}
            required
            maxLength={EXPENSE_DESCRIPTION_MAX}
            placeholder="Shop rent, electric bill…"
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
              defaultValue={bill?.amount}
              required
            />
          </Field>
          <Field label="Frequency" required>
            <Select name="frequency" defaultValue={bill?.frequency ?? "monthly"} required>
              {EXPENSE_BILL_FREQUENCIES.map((freq) => (
                <option key={freq} value={freq}>
                  {FREQUENCY_LABELS[freq]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Next due date" hint="Shop calendar day this bill is due." required>
          <Input
            name="next_due_date"
            type="date"
            defaultValue={bill?.nextDueDate ?? defaultDueDate}
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Remind days before"
            hint={`Daily push from this many days before due (0–${EXPENSE_BILL_REMIND_DAYS_MAX}).`}
            required={false}
          >
            <Input
              name="remind_days_before"
              type="number"
              inputMode="numeric"
              min={0}
              max={EXPENSE_BILL_REMIND_DAYS_MAX}
              defaultValue={bill?.remindDaysBefore ?? 3}
              className="num"
            />
          </Field>
          <Field label="Category" hint="Optional — rent, wages, utilities…" required={false}>
            <Input
              name="category"
              defaultValue={bill?.category ?? ""}
              maxLength={EXPENSE_CATEGORY_MAX}
            />
          </Field>
        </div>

        <Field label="Note" required={false}>
          <Input
            name="note"
            defaultValue={bill?.note ?? ""}
            maxLength={EXPENSE_NOTE_MAX}
          />
        </Field>

        <label className="flex items-center gap-2 text-body">
          <input
            type="checkbox"
            name="reminders_enabled"
            defaultChecked={bill?.remindersEnabled ?? true}
            className="size-4 accent-[var(--color-primary)]"
          />
          Send daily FCM reminders in the window before due
        </label>

        {bill ? (
          <label className="flex items-center gap-2 text-body">
            <input
              type="checkbox"
              name="active"
              defaultChecked={bill.active}
              className="size-4 accent-[var(--color-primary)]"
            />
            Active
          </label>
        ) : null}

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
        {state.ok ? <SuccessNote>Saved.</SuccessNote> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button
            type="submit"
            loading={pending}
            icon={bill ? Check : CalendarClock}
            className="w-full sm:w-auto"
          >
            {pending ? "Saving..." : bill ? "Save changes" : "Add bill"}
          </Button>
          {onDone ? (
            <Button type="button" variant="secondary" onClick={onDone} className="w-full sm:w-auto">
              Cancel
            </Button>
          ) : null}
        </div>
      </form>

      {bill ? (
        <>
          <div className="mt-6 border-t border-hairline pt-4">
            <Button
              type="button"
              variant="secondary"
              icon={Trash2}
              className="w-full text-danger sm:w-auto"
              onClick={() => setConfirmDelete(true)}
            >
              Delete bill
            </Button>
          </div>
          <ConfirmDialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Delete this bill?"
            description="Ledger expenses already logged stay. Only the schedule is removed."
            confirmLabel={deleting ? "Deleting…" : "Delete"}
            confirmationText={bill.description}
            onConfirm={confirmRemove}
            pending={deleting}
          />
        </>
      ) : null}
    </>
  );
}
