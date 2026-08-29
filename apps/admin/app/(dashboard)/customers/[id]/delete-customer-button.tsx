"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { ErrorNote } from "@/components/ui";
import { ConfirmDialog } from "@/components/overlay";
import { useInvalidateCustomers } from "@/lib/query/customers";
import { removeCustomer } from "../actions";

export function DeleteCustomerButton({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateCustomers();

  function confirm() {
    const form = new FormData();
    form.set("id", customerId);
    startTransition(async () => {
      const result = await removeCustomer(form);
      if (result.error) {
        setError(result.error);
        setOpen(false);
        return;
      }
      invalidate();
      setOpen(false);
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-body text-danger hover:underline"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 size={14} strokeWidth={2} aria-hidden />
        Delete customer
      </button>
      {error ? (
        <div className="mt-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        pending={pending}
        title="Delete customer?"
        description={`${customerName} will be removed. Sales keep the name already printed on them. This cannot be undone.`}
        confirmLabel="Delete customer"
        confirmationText={customerName}
      />
    </div>
  );
}
