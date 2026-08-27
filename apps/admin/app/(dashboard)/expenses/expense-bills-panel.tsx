"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check, Pencil } from "lucide-react";
import { formatMoney, type ExpenseBill } from "@double-a/shared-types";
import { Button, Card, EmptyState, IconButton, Money, Table, Td, Th } from "@/components/ui";
import { Sheet } from "@/components/overlay";
import { formatStoreDay } from "@/lib/date-range";
import { useInvalidateExpenseBills } from "@/lib/query/expense-bills";
import { payExpenseBill } from "./bill-actions";
import { ExpenseBillForm } from "./expense-bill-form";

const FREQUENCY_LABEL: Record<ExpenseBill["frequency"], string> = {
  once: "Once",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function ExpenseBillsPanel({
  bills,
  defaultDueDate,
}: {
  bills: ExpenseBill[];
  defaultDueDate: string;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ExpenseBill | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, startPay] = useTransition();
  const invalidate = useInvalidateExpenseBills();

  const active = bills.filter((b) => b.active);
  const inactive = bills.filter((b) => !b.active);

  function markPaid(bill: ExpenseBill) {
    setPayError(null);
    setPayingId(bill.id);
    const form = new FormData();
    form.set("id", bill.id);
    form.set("expense_date", bill.nextDueDate);
    startPay(async () => {
      const result = await payExpenseBill(form);
      if (!result.ok) {
        setPayError(result.error ?? "Could not mark paid.");
        setPayingId(null);
        return;
      }
      invalidate();
      setPayingId(null);
    });
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <div>
            <h2 className="text-body font-medium">Bills & reminders</h2>
            <p className="text-caption text-ink-muted">
              Schedules only — Mark paid writes the ledger expense and advances the due date.
            </p>
          </div>
          <Button type="button" icon={CalendarClock} onClick={() => setCreating(true)}>
            Add bill
          </Button>
        </div>

        {payError ? (
          <p className="border-b border-hairline px-4 py-2 text-caption text-danger">{payError}</p>
        ) : null}

        {active.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No active bills"
            instruction="Add rent, utilities, or other recurring outlays. Daily FCM reminders fire at 8am in the shop timezone."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Due</Th>
                <Th>Description</Th>
                <Th>Frequency</Th>
                <Th>Remind</Th>
                <Th numeric>Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {active.map((bill) => (
                <tr key={bill.id}>
                  <Td className="whitespace-nowrap num">{formatStoreDay(bill.nextDueDate)}</Td>
                  <Td>
                    <div className="font-medium">{bill.description}</div>
                    {bill.category ? (
                      <div className="mt-0.5 text-caption text-ink-muted">{bill.category}</div>
                    ) : null}
                  </Td>
                  <Td className="text-ink-muted">{FREQUENCY_LABEL[bill.frequency]}</Td>
                  <Td className="text-ink-muted">
                    {bill.remindersEnabled
                      ? `${bill.remindDaysBefore}d before`
                      : "Off"}
                  </Td>
                  <Td numeric>
                    <Money value={bill.amount} />
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        icon={Check}
                        loading={paying && payingId === bill.id}
                        onClick={() => markPaid(bill)}
                        className="!px-2"
                      >
                        Mark paid
                      </Button>
                      <IconButton
                        icon={Pencil}
                        label={`Edit ${formatMoney(bill.amount)} bill`}
                        onClick={() => setEditing(bill)}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {inactive.length > 0 ? (
          <div className="border-t border-hairline px-4 py-3">
            <p className="mb-2 text-caption text-ink-muted">
              Inactive ({inactive.length})
            </p>
            <ul className="space-y-1 text-caption text-ink-muted">
              {inactive.map((bill) => (
                <li key={bill.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-left hover:text-primary hover:underline"
                    onClick={() => setEditing(bill)}
                  >
                    {bill.description}
                  </button>
                  <Money value={bill.amount} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="Add a bill"
        description="Reminders at 8am Asia/Manila. Mark paid to hit Net."
      >
        <ExpenseBillForm
          defaultDueDate={defaultDueDate}
          onDone={() => setCreating(false)}
        />
      </Sheet>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.description}` : "Edit bill"}
      >
        {editing ? (
          <ExpenseBillForm
            key={editing.id}
            bill={editing}
            defaultDueDate={defaultDueDate}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
    </>
  );
}
