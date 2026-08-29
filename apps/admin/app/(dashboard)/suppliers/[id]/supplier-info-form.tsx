"use client";

import { useActionState, useEffect } from "react";
import { Check } from "lucide-react";
import {
  SUPPLIER_ADDRESS_MAX,
  SUPPLIER_CONTACT_PERSON_MAX,
  SUPPLIER_EMAIL_MAX,
  SUPPLIER_NAME_MAX,
  SUPPLIER_NOTES_MAX,
  SUPPLIER_PHONE_MAX,
} from "@double-a/shared-types";
import type { Supplier } from "@double-a/shared-types";
import { Button, ErrorNote, Field, Input, SuccessNote, Textarea } from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateSuppliers } from "@/lib/query/suppliers";
import { saveSupplierInfo } from "../actions";

/** The detail page's Info tab — fields only, saved independently from Products. */
export function SupplierInfoForm({ supplier }: { supplier: Supplier }) {
  const [state, action, pending] = useActionState(saveSupplierInfo, EMPTY_FORM_STATE);
  const invalidate = useInvalidateSuppliers();

  useEffect(() => {
    if (state.ok) invalidate();
  }, [state.ok, invalidate]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={supplier.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <Input name="name" defaultValue={supplier.name} required maxLength={SUPPLIER_NAME_MAX} />
        </Field>
        <Field label="Contact person" required={false}>
          <Input
            name="contact_person"
            defaultValue={supplier.contactPerson ?? ""}
            maxLength={SUPPLIER_CONTACT_PERSON_MAX}
          />
        </Field>
        <Field label="Phone" required={false}>
          <Input name="phone" defaultValue={supplier.phone ?? ""} maxLength={SUPPLIER_PHONE_MAX} />
        </Field>
        <Field label="Secondary phone" required={false}>
          <Input
            name="secondary_phone"
            defaultValue={supplier.secondaryPhone ?? ""}
            maxLength={SUPPLIER_PHONE_MAX}
          />
        </Field>
        <Field label="Email" required={false}>
          <Input
            name="email"
            type="email"
            defaultValue={supplier.email ?? ""}
            maxLength={SUPPLIER_EMAIL_MAX}
          />
        </Field>
        <Field label="Secondary email" required={false}>
          <Input
            name="secondary_email"
            type="email"
            defaultValue={supplier.secondaryEmail ?? ""}
            maxLength={SUPPLIER_EMAIL_MAX}
          />
        </Field>
      </div>

      <Field label="Address" required={false}>
        <Input name="address" defaultValue={supplier.address ?? ""} maxLength={SUPPLIER_ADDRESS_MAX} />
      </Field>

      <Field label="Notes" hint="Payment terms, delivery quirks, anything else worth remembering." required={false}>
        <Textarea name="notes" defaultValue={supplier.notes ?? ""} maxLength={SUPPLIER_NOTES_MAX} rows={3} />
      </Field>

      <Field
        label="Active"
        hint="Off hides it from new purchase orders. Existing orders are unaffected."
        required={false}
      >
        <label className="flex min-h-11 items-center gap-2 rounded-sm border border-border bg-surface px-3 text-body">
          <input
            type="checkbox"
            name="is_active"
            value="true"
            defaultChecked={supplier.isActive}
            className="size-4 accent-primary"
          />
          Supplier is active
        </label>
      </Field>

      {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      {state.ok ? <SuccessNote>Saved.</SuccessNote> : null}

      <Button type="submit" loading={pending} icon={Check} className="w-full sm:w-auto">
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
