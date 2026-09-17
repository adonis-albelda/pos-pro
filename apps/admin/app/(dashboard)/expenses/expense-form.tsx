"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Camera, Check, FileText, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import {
  EXPENSE_CATEGORY_MAX,
  EXPENSE_DESCRIPTION_MAX,
  EXPENSE_NOTE_MAX,
} from "@double-a/shared-types";
import type { Expense, Location } from "@double-a/shared-types";
import { SheetFooter, useSheetChrome } from "@/components/overlay";
import {
  Button,
  Combobox,
  ErrorNote,
  Field,
  Input,
  MoneyInput,
  Select,
  SuccessNote,
} from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useAttachExpenseReceipt, useInvalidateExpenses } from "@/lib/query/expenses";
import { useCategories, useCreateCategory } from "@/lib/query/categories";
import { saveExpense } from "./actions";

/**
 * "Type to search, or create it" Combobox picker, same pattern as
 * BrandPicker (product-form.tsx) — except the value here is the category
 * *name* itself, not an id: expenses.category is a plain string column, not
 * a foreign key (unlike products.category_id), so there's nothing to join
 * back to. Options are every category with category_type "expense" only —
 * the product catalog tree never shows up here.
 */
function ExpenseCategoryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const categoriesQuery = useCategories({ categoryType: "expense" });
  const createCategory = useCreateCategory();
  const categories = categoriesQuery.data ?? [];

  function onCreate(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed.length > EXPENSE_CATEGORY_MAX) {
      toast.error(`Category name can't be longer than ${EXPENSE_CATEGORY_MAX} characters.`);
      return;
    }
    const existing = categories.find(
      (category) => category.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      onChange(existing.name);
      return;
    }
    createCategory.mutate(
      { name: trimmed, categoryType: "expense" },
      {
        onSuccess: (created) => onChange(created.name),
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Could not create that category."),
      },
    );
  }

  return (
    <Combobox
      value={value}
      onChange={onChange}
      placeholder={categoriesQuery.isPending ? "Loading…" : "No category"}
      emptyLabel={categoriesQuery.isPending ? "Loading…" : undefined}
      options={[
        { value: "", label: "No category" },
        ...categories.map((category) => ({ value: category.name, label: category.name })),
      ]}
      creatable
      createOptionLabel={(typed) => `"${typed}" doesn't exist — create it`}
      onCreate={onCreate}
    />
  );
}

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
  const formId = useId();
  const inSheet = useSheetChrome() !== null;
  const [state, action, pending] = useActionState(saveExpense, EMPTY_FORM_STATE);
  const invalidateExpenses = useInvalidateExpenses();
  const attachReceipt = useAttachExpenseReceipt();
  const [category, setCategory] = useState(expense?.category ?? "");

  // Creating: no expense id exists yet, so a picked file waits here and
  // uploads once the action above returns the newly created row's id.
  // Editing: uploads immediately on pick, straight to that existing id.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingReceipt, setPendingReceipt] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(
    expense?.receiptUrl ?? null,
  );

  useEffect(() => {
    if (!state.ok) return;
    // Sheet closes right below — this upload finishes in the background and
    // the expense list picks up the receipt once useAttachExpenseReceipt's
    // own onSuccess invalidates it, same as autoPush-style "never block on
    // the optional extra" elsewhere in this codebase.
    if (pendingReceipt && state.id) {
      attachReceipt.mutate({ id: state.id, photo: pendingReceipt });
      setPendingReceipt(null);
    }
    invalidateExpenses();
    onDone?.();
    // invalidateExpenses is stable enough for this effect; only state.ok/onDone gate re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.id, onDone]);

  function onPickReceipt(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (expense) {
      attachReceipt.mutate(
        { id: expense.id, photo: file },
        {
          onSuccess: (updated) => setReceiptPreviewUrl(updated.receiptUrl),
        },
      );
      return;
    }

    setPendingReceipt(file);
    setReceiptPreviewUrl(URL.createObjectURL(file));
  }

  const actions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {onDone ? (
        <Button type="button" variant="secondary" icon={X} onClick={onDone}>
          Cancel
        </Button>
      ) : null}
      <Button
        type="submit"
        form={inSheet ? formId : undefined}
        loading={pending}
        icon={expense ? Check : Wallet}
      >
        {pending ? "Saving..." : expense ? "Save changes" : "Add expense"}
      </Button>
    </div>
  );

  return (
    <>
      <form id={formId} action={action} className="space-y-4">
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" hint="Optional — rent, wages, utilities…" required={false}>
            <ExpenseCategoryPicker value={category} onChange={setCategory} />
            <input type="hidden" name="category" value={category} />
          </Field>
          <Field
            label="Paid with"
            hint="Only cash affects Cash Flow's cash position."
            required={false}
          >
            <Select name="payment_method" defaultValue={expense?.paymentMethod ?? "cash"}>
              <option value="cash">Cash</option>
              <option value="ewallet">E-wallet</option>
              <option value="card">Card</option>
              <option value="credit">Credit</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        </div>

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

        <Field
          label="Proof"
          hint={
            expense
              ? "Optional — a photo of the receipt or invoice. Replaces any previous one."
              : "Optional — a photo of the receipt or invoice. Uploads once you save."
          }
          required={false}
        >
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              capture="environment"
              className="hidden"
              onChange={onPickReceipt}
            />
            <Button
              type="button"
              variant="secondary"
              icon={Camera}
              loading={attachReceipt.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {receiptPreviewUrl ? "Replace proof photo" : "Add proof photo"}
            </Button>
            {receiptPreviewUrl ? (
              /^https?:\/\/.*\.pdf(\?|$)/i.test(receiptPreviewUrl) ? (
                <a
                  href={receiptPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex size-11 items-center justify-center rounded-sm border border-border bg-canvas text-ink-muted"
                >
                  <FileText size={18} />
                </a>
              ) : (
                <img
                  src={receiptPreviewUrl}
                  alt="Expense proof"
                  className="size-11 rounded-sm border border-border object-cover"
                />
              )
            ) : null}
          </div>
        </Field>

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
        {state.ok ? <SuccessNote>Saved.</SuccessNote> : null}

        {!inSheet ? actions : null}
      </form>
      {inSheet ? <SheetFooter>{actions}</SheetFooter> : null}
    </>
  );
}
