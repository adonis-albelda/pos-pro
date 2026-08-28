"use client";

import { useActionState, useEffect } from "react";
import { HandCoins } from "lucide-react";
import { Button, ErrorNote, Field, Input, MoneyInput, SuccessNote } from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateCustomers } from "@/lib/query/customers";
import { recordCustomerPaymentAction } from "../actions";

/** Amount + optional note, defaulting paid_at to now server-side — no date picker, matches how PatchSaleFlags/PO payments keep the form to what a cashier actually needs mid-transaction. */
export function RecordCustomerPaymentForm({ customerId }: { customerId: string }) {
  const [state, action, pending] = useActionState(recordCustomerPaymentAction, EMPTY_FORM_STATE);
  const invalidate = useInvalidateCustomers();

  useEffect(() => {
    if (state.ok) invalidate();
    // invalidate is stable enough for this effect; only state.ok gates re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="customer_id" value={customerId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <MoneyInput name="amount" type="number" step="0.01" min="0.01" required />
        </Field>
        <Field label="Note (optional)">
          <Input name="note" />
        </Field>
      </div>

      {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      {state.ok ? <SuccessNote>Payment recorded.</SuccessNote> : null}

      <Button type="submit" loading={pending} icon={HandCoins} className="w-full sm:w-auto">
        {pending ? "Recording..." : "Record payment"}
      </Button>
    </form>
  );
}
