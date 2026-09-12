"use client";

import { useEffect, useState } from "react";
import { Bell, CalendarClock, Plus } from "lucide-react";
import { toast } from "sonner";
import type { GoodsReceipt } from "@double-a/api-client/queries";
import { Badge, Button, Card, CardHeader, Field, Input, Money, MoneyInput, Table, Td, Th } from "@/components/ui";
import {
  useAddGoodsReceiptPayment,
  useUpdateGoodsReceipt,
  useUpdateGoodsReceiptPayment,
} from "@/lib/query/goods-receipts";

const REMIND_DAYS_MAX = 90;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function AddInstallmentForm({ goodsReceiptId, nextTermNumber }: { goodsReceiptId: string; nextTermNumber: number }) {
  const addPayment = useAddGoodsReceiptPayment(goodsReceiptId);
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function onAdd() {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    addPayment.mutate(
      { termNumber: nextTermNumber, dueDate: dueDate || null, amount: parsed, note: note.trim() || null },
      {
        onSuccess: () => {
          setDueDate("");
          setAmount("");
          setNote("");
        },
        onError: (error) => toast.error(errorMessage(error, "Could not add that installment.")),
      },
    );
  }

  return (
    <div className="w-full rounded-md border border-dashed border-border p-3 sm:p-4">
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
        <div className="sm:col-span-3">
          <Field label="Due date">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="Amount">
            <MoneyInput
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
        </div>
        <div className="sm:col-span-4">
          <Field label="Note" required={false}>
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Button
            type="button"
            icon={Plus}
            className="w-full"
            onClick={onAdd}
            loading={addPayment.isPending}
            disabled={!amount.trim()}
          >
            Add term {nextTermNumber}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PaymentReminderBanner({ receipt }: { receipt: GoodsReceipt }) {
  const updateReceipt = useUpdateGoodsReceipt(receipt.id);
  const [enabled, setEnabled] = useState(receipt.remindersEnabled);
  const [days, setDays] = useState(String(receipt.remindDaysBefore));

  useEffect(() => {
    setEnabled(receipt.remindersEnabled);
    setDays(String(receipt.remindDaysBefore));
  }, [receipt.remindDaysBefore, receipt.remindersEnabled]);

  function save(next: { remindersEnabled?: boolean; remindDaysBefore?: number }) {
    updateReceipt.mutate(next, {
      onError: (error) => toast.error(errorMessage(error, "Could not update reminder.")),
    });
  }

  function onToggle(checked: boolean) {
    setEnabled(checked);
    save({ remindersEnabled: checked });
  }

  function onDaysBlur() {
    const parsed = Number(days);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > REMIND_DAYS_MAX) {
      setDays(String(receipt.remindDaysBefore));
      toast.error(`Remind days must be 0–${REMIND_DAYS_MAX}.`);
      return;
    }
    if (parsed === receipt.remindDaysBefore) return;
    save({ remindDaysBefore: parsed });
  }

  return (
    <div
      className={`flex w-full flex-col gap-3 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        enabled
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-paper"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${
            enabled ? "bg-primary/15 text-primary" : "bg-border/60 text-ink-muted"
          }`}
        >
          <Bell size={16} strokeWidth={2} />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-body font-medium text-ink">Remind me before due</p>
          <p className="text-caption text-ink-muted">
            Nudge before each unpaid installment due date (0–{REMIND_DAYS_MAX} days).
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
        <label className="flex items-center gap-2 text-body text-ink">
          <span className="text-ink-muted">Remind me</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={REMIND_DAYS_MAX}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            onBlur={onDaysBlur}
            disabled={!enabled || updateReceipt.isPending}
            className="num w-16 text-center"
            aria-label="Remind days before due"
          />
          <span className="text-ink-muted">days before</span>
        </label>
        <label className="flex items-center gap-2 text-caption text-ink-muted">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onToggle(event.target.checked)}
            className="size-4 accent-primary"
            disabled={updateReceipt.isPending}
          />
          On
        </label>
      </div>
    </div>
  );
}

/**
 * Only meaningful when the receipt isn't cash-on-delivery — but the toggle
 * below stays available regardless, so a merchant can correct an AI misread
 * ("Cash on Delivery" extracted when the paper actually said "30 Days") and
 * have that correction actually persist (PATCH /goods-receipts/{id}), not
 * just reveal this panel client-side.
 */
export function ReceivingPaymentTermsPanel({ receipt }: { receipt: GoodsReceipt }) {
  const updateReceipt = useUpdateGoodsReceipt(receipt.id);
  const updatePayment = useUpdateGoodsReceiptPayment(receipt.id);
  const [forceOpen, setForceOpen] = useState(false);

  const isInstallment = receipt.paymentTerms === "installment";
  const open = isInstallment || forceOpen;
  const nextTermNumber = receipt.payments.length + 1;

  function toggle(checked: boolean) {
    setForceOpen(checked);
    if (checked && !isInstallment) {
      updateReceipt.mutate(
        { paymentTerms: "installment" },
        { onError: (error) => toast.error(errorMessage(error, "Could not update payment terms.")) },
      );
    }
  }

  return (
    <Card className="w-full">
      <CardHeader
        icon={CalendarClock}
        title="Setup payment terms"
        description="This delivery's own installment schedule — separate from purchase-order terms."
        action={
          <label className="flex items-center gap-2 text-caption text-ink-muted">
            <input
              type="checkbox"
              checked={open}
              onChange={(event) => toggle(event.target.checked)}
              className="size-4 accent-primary"
              disabled={updateReceipt.isPending}
            />
            Has payment terms
          </label>
        }
      />

      {open ? (
        <div className="w-full space-y-4 border-t border-border px-4 py-4 sm:px-6">
          <PaymentReminderBanner receipt={receipt} />

          {receipt.payments.length > 0 ? (
            <div className="w-full overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Term</Th>
                    <Th>Due date</Th>
                    <Th numeric>Amount</Th>
                    <Th>Status</Th>
                    <Th>Note</Th>
                    <Th> </Th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.payments.map((payment) => (
                    <tr key={payment.id}>
                      <Td>{payment.termNumber}</Td>
                      <Td>{payment.dueDate ?? "—"}</Td>
                      <Td numeric>
                        <Money value={payment.amount} />
                      </Td>
                      <Td>
                        {payment.isPaid ? (
                          <Badge tone="success">Paid{payment.paidDate ? ` ${payment.paidDate}` : ""}</Badge>
                        ) : (
                          <Badge tone="warning">Unpaid</Badge>
                        )}
                      </Td>
                      <Td>{payment.note ?? "—"}</Td>
                      <Td numeric>
                        {!payment.isPaid ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            loading={updatePayment.isPending}
                            onClick={() =>
                              updatePayment.mutate(
                                { paymentId: payment.id, isPaid: true },
                                {
                                  onError: (error) =>
                                    toast.error(errorMessage(error, "Could not mark this term paid.")),
                                },
                              )
                            }
                          >
                            Mark paid
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            loading={updatePayment.isPending}
                            onClick={() =>
                              updatePayment.mutate(
                                { paymentId: payment.id, isPaid: false },
                                {
                                  onError: (error) =>
                                    toast.error(errorMessage(error, "Could not mark this term unpaid.")),
                                },
                              )
                            }
                          >
                            Undo
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <p className="text-body text-ink-muted">No installment terms yet — add the first one below.</p>
          )}

          <AddInstallmentForm goodsReceiptId={receipt.id} nextTermNumber={nextTermNumber} />
        </div>
      ) : null}
    </Card>
  );
}
