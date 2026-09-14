"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setContact("");
      setAddress("");
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
      { name: trimmed, contact: contact.trim() || null, address: address.trim() || null },
      {
        onSuccess: (customer) => onCreated(customer.id),
        onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not create this customer."),
      },
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add new customer" className="!w-[90vw] max-w-none">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer name" autoFocus />
          </Field>
          <Field label="Contact" required={false}>
            <Input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="Phone or e-mail"
            />
          </Field>
          <Field label="Address" required={false}>
            <Input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Delivery address"
            />
          </Field>
        </div>

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
