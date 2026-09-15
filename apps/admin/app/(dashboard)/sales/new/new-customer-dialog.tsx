"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { CUSTOMER_GENDER_LABELS, type CustomerGender } from "@double-a/shared-types";
import { Button, ErrorNote, Field, Input, Select } from "@/components/ui";
import { Dialog } from "@/components/overlay";
import { useCreateCustomer } from "@/lib/query/customers";

/** Quick "add a customer without leaving the sale" dialog for Create Sale's own customer picker. */
export function NewCustomerDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (customerId: string) => void;
}) {
  const create = useCreateCustomer();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<CustomerGender | "">("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setContact("");
      setAddress("");
      setEmail("");
      setDateOfBirth("");
      setGender("");
      setNotes("");
      setError(null);
    }
  }, [open]);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Customer name is required.");
      return;
    }
    setError(null);
    create.mutate(
      {
        name: trimmed,
        contact: contact.trim() || null,
        address: address.trim() || null,
        email: email.trim() || null,
        dateOfBirth: dateOfBirth || null,
        gender: gender || null,
        notes: notes.trim() || null,
      },
      {
        onSuccess: (customer) => onCreated(customer.id),
        onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not create this customer."),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add new customer"
      className="sm:!max-w-xl lg:!w-[60vw] lg:!max-w-none"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Name" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer name" autoFocus />
          </Field>
          <Field label="Contact" required={false}>
            <Input
              type="tel"
              inputMode="tel"
              value={contact}
              onChange={(event) => setContact(event.target.value.replace(/[^0-9+\-\s()]/g, ""))}
              placeholder="Phone number"
            />
          </Field>
          <Field label="Email" required={false}>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </Field>
          <Field label="Address" required={false}>
            <Input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Delivery address"
            />
          </Field>
          <Field label="Date of birth" required={false}>
            <Input
              type="date"
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
            />
          </Field>
          <Field label="Gender" required={false}>
            <Select
              value={gender}
              onChange={(event) => setGender(event.target.value as CustomerGender | "")}
            >
              <option value="">Not specified</option>
              {(Object.entries(CUSTOMER_GENDER_LABELS) as [CustomerGender, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Notes" required={false} hint="Staff-only — never shown to the customer.">
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" />
        </Field>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" className="w-full sm:flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            icon={UserPlus}
            loading={create.isPending}
            disabled={create.isPending}
            className="w-full sm:flex-1"
            onClick={submit}
          >
            Add customer
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
