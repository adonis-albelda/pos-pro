"use client";

import { useActionState, useEffect, useId } from "react";
import {
  Cake,
  Check,
  IdCard,
  Mail,
  MapPin,
  Phone,
  StickyNote,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { CUSTOMER_FIELD_MAX_LENGTH, CUSTOMER_GENDER_LABELS } from "@double-a/shared-types";
import type { Customer } from "@double-a/shared-types";
import { SheetFooter, useSheetChrome } from "@/components/overlay";
import { Button, ErrorNote, Field, Input, Select, SuccessNote } from "@/components/ui";
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
  const formId = useId();
  const inSheet = useSheetChrome() !== null;
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

  const actions = (
    <div className="flex justify-end gap-2">
      {onDone ? (
        <Button type="button" variant="secondary" icon={X} onClick={onDone}>
          Cancel
        </Button>
      ) : null}
      <Button
        type="submit"
        form={inSheet ? formId : undefined}
        loading={pending}
        icon={customer ? Check : UserPlus}
      >
        {pending ? "Saving..." : customer ? "Save changes" : "Add customer"}
      </Button>
    </div>
  );

  return (
    <>
      <form id={formId} action={action} className="space-y-4">
        {customer ? <input type="hidden" name="id" value={customer.id} /> : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" required>
            <Input
              name="name"
              icon={UserRound}
              defaultValue={customer?.name}
              required
              maxLength={CUSTOMER_FIELD_MAX_LENGTH}
            />
          </Field>
          <Field label="Contact" required={false}>
            <Input
              name="contact"
              icon={Phone}
              defaultValue={customer?.contact ?? ""}
              maxLength={CUSTOMER_FIELD_MAX_LENGTH}
            />
          </Field>
          <Field label="Email" required={false}>
            <Input
              type="email"
              name="email"
              icon={Mail}
              defaultValue={customer?.email ?? ""}
              maxLength={CUSTOMER_FIELD_MAX_LENGTH}
            />
          </Field>
          <Field label="Address" required={false}>
            <Input
              name="address"
              icon={MapPin}
              defaultValue={customer?.address ?? ""}
              maxLength={CUSTOMER_FIELD_MAX_LENGTH}
            />
          </Field>
          <Field label="Date of birth" required={false}>
            <Input
              type="date"
              name="date_of_birth"
              icon={Cake}
              defaultValue={customer?.dateOfBirth ?? ""}
            />
          </Field>
          <Field label="Gender" required={false}>
            <Select name="gender" defaultValue={customer?.gender ?? ""}>
              <option value="">Not specified</option>
              {Object.entries(CUSTOMER_GENDER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Notes" required={false} hint="Staff-only — never shown to the customer.">
          <Input
            name="notes"
            icon={StickyNote}
            defaultValue={customer?.notes ?? ""}
            maxLength={2000}
          />
        </Field>

        <div className="space-y-3 rounded-md border border-border p-4">
          <p className="text-body font-medium text-ink">Senior / PWD discount</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ID number" required={false}>
              <Input
                name="id_number"
                icon={IdCard}
                defaultValue={customer?.idNumber ?? ""}
                maxLength={50}
              />
            </Field>
            <Field label="Cardholder name" required={false} hint="Name printed on the ID — independent of the customer's own name.">
              <Input
                name="cardholder_name"
                icon={UserRound}
                defaultValue={customer?.cardholderName ?? ""}
                maxLength={160}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-body text-ink">
            <input
              type="checkbox"
              name="is_pwd_eligible"
              defaultChecked={customer?.isPwdEligible ?? false}
              className="size-4 rounded border-border"
            />
            PWD eligible — shows in the POS discount dialog&apos;s PWD picker.
          </label>
          <label className="flex items-center gap-2 text-body text-ink">
            <input
              type="checkbox"
              name="is_senior_eligible"
              defaultChecked={customer?.isSeniorEligible ?? false}
              className="size-4 rounded border-border"
            />
            Senior citizen eligible — shows in the POS discount dialog&apos;s Senior picker.
          </label>
        </div>

        {customer ? (
          <label className="flex items-center gap-2 text-body text-ink">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={customer.isActive}
              className="size-4 rounded border-border"
            />
            Active
          </label>
        ) : null}

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
        {state.ok ? <SuccessNote>Saved.</SuccessNote> : null}

        {!inSheet ? actions : null}
      </form>
      {inSheet ? <SheetFooter>{actions}</SheetFooter> : null}
    </>
  );
}
