"use client";

import { useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { toast } from "sonner";
import type { GoodsReceipt } from "@double-a/api-client/queries";
import { Badge, Button, Card, CardHeader, Field, Input, Money, MoneyInput, Table, Td, Th } from "@/components/ui";
import {
  useAddGoodsReceiptPayment,
  useUpdateGoodsReceipt,
  useUpdateGoodsReceiptPayment,
} from "@/lib/query/goods-receipts";

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
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3">
      <div className="w-36">
        <Field label="Due date">
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </Field>
      </div>
      <div className="w-32">
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
      <div className="w-48">
        <Field label="Note" required={false}>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <Button
        type="button"
        icon={Plus}
        onClick={onAdd}
        loading={addPayment.isPending}
        disabled={!amount.trim()}
      >
        Add term {nextTermNumber}
      </Button>
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
    <Card>
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
        <div className="space-y-3 border-t border-border px-4 py-4 sm:px-6">
          {receipt.payments.length > 0 ? (
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
          ) : (
            <p className="text-body text-ink-muted">No installment terms yet — add the first one below.</p>
          )}

          <AddInstallmentForm goodsReceiptId={receipt.id} nextTermNumber={nextTermNumber} />
        </div>
      ) : null}
    </Card>
  );
}
