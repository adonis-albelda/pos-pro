"use client";

import { useActionState, useEffect } from "react";
import { Check, UserPlus } from "lucide-react";
import { CUSTOMER_FIELD_MAX_LENGTH } from "@double-a/shared-types";
import type { Customer } from "@double-a/shared-types";
import { Button, ErrorNote, Field, Input, SuccessNote } from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateCustomers } from "@/lib/query/customers";
import { saveCustomer } from "./actions";

export function CustomerForm({
  customer,
  onDone,
}: {
  customer?: Customer;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveCustomer, EMPTY_FORM_STATE);
  const invalidate = useInvalidateCustomers();

  useEffect(() => {
    if (state.ok) {
      invalidate();
      onDone?.();
    }
    // invalidate is stable enough for this effect; only state.ok/onDone gate re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, onDone]);

  return (
    <form action={action} className="space-y-4">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" required>
          <Input
            name="name"
            defaultValue={customer?.name}
            required
            maxLength={CUSTOMER_FIELD_MAX_LENGTH}
          />
        </Field>
        <Field label="Contact" required={false}>
          <Input
            name="contact"
            defaultValue={customer?.contact ?? ""}
            maxLength={CUSTOMER_FIELD_MAX_LENGTH}
          />
        </Field>
        <Field label="Address" required={false}>
          <Input
            name="address"
            defaultValue={customer?.address ?? ""}
            maxLength={CUSTOMER_FIELD_MAX_LENGTH}
          />
        </Field>
      </div>

      {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      {state.ok ? <SuccessNote>Saved.</SuccessNote> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button
          type="submit"
          loading={pending}
          icon={customer ? Check : UserPlus}
          className="w-full sm:w-auto"
        >
          {pending ? "Saving..." : customer ? "Save changes" : "Add customer"}
        </Button>
        {onDone ? (
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
