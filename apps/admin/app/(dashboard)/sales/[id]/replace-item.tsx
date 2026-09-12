"use client";

import { useMemo, useState, useTransition } from "react";
import { Banknote, Repeat, RotateCcw } from "lucide-react";
import type { Product, SaleItem } from "@double-a/shared-types";
import { formatMoney, roundMoney } from "@double-a/shared-types";
import { Button, ErrorNote, Field, Input, Money } from "@/components/ui";
import { Dialog } from "@/components/overlay";
import { ProductPicker } from "@/components/product-picker";
import { useInvalidateSales } from "@/lib/query/sales";
import {
  refundSaleItemAction,
  replaceSaleItemAction,
  searchProductsForReplace,
} from "./actions";

type Mode = "replace" | "refund";

/**
 * Per-line fix on a completed sale: swap the product, or refund the line.
 * Original row stays on the record either way (CLAUDE.md §6). Cash on hand
 * is the notes the customer hands over when the replacement costs more —
 * change is computed here for the attendant, not stored.
 */
export function ReplaceItem({ saleId, item }: { saleId: string; item: SaleItem }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("replace");
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [cashOnHand, setCashOnHand] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const invalidate = useInvalidateSales();

  const qty = Number(quantity);
  const qtyValid = Number.isFinite(qty) && qty > 0;

  const originalCharged = item.subtotal;
  const replacementTotal =
    mode === "replace" && product && qtyValid
      ? roundMoney(product.price * qty)
      : null;

  const delta =
    replacementTotal === null ? null : roundMoney(replacementTotal - originalCharged);
  const amountDue = delta !== null && delta > 0 ? delta : 0;
  const refundDue =
    mode === "refund"
      ? originalCharged
      : delta !== null && delta < 0
        ? Math.abs(delta)
        : 0;

  const cashParsed = Number(cashOnHand);
  const cashValid =
    amountDue === 0 || (Number.isFinite(cashParsed) && cashParsed >= amountDue);
  const change =
    amountDue > 0 && cashValid ? roundMoney(cashParsed - amountDue) : 0;

  function close() {
    if (pending) return;
    setOpen(false);
    setMode("replace");
    setProduct(null);
    setQuantity(String(item.quantity));
    setCashOnHand("");
    setError(null);
  }

  function confirmReplace() {
    if (!product) {
      setError("Pick the replacement product first.");
      return;
    }
    if (!qtyValid) {
      setError("Quantity must be greater than zero.");
      return;
    }
    if (!cashValid) {
      setError("Cash on hand must cover what the customer still owes.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await replaceSaleItemAction(saleId, item.id, product.id, qty);
        invalidate();
        setOpen(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not replace this line item.");
      }
    });
  }

  function confirmRefund() {
    setError(null);
    startTransition(async () => {
      try {
        await refundSaleItemAction(saleId, item.id);
        invalidate();
        setOpen(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not refund this line item.");
      }
    });
  }

  const title = useMemo(
    () => (mode === "refund" ? `Refund ${item.productName}` : `Replace ${item.productName}`),
    [mode, item.productName],
  );

  return (
    <>
      <Button variant="ghost" size="sm" icon={Repeat} onClick={() => setOpen(true)}>
        Fix
      </Button>

      <Dialog
        open={open}
        onClose={close}
        title={title}
        description={
          mode === "refund"
            ? "Original line stays on the record. Stock comes back and the sale total drops this line."
            : "Original line stays on the record — this adds a new line for the replacement and updates the total."
        }
      >
        <div className="space-y-4">
          <div
            className="flex gap-1 rounded-sm border border-border bg-paper p-1"
            role="tablist"
            aria-label="Fix type"
          >
            {(
              [
                { id: "replace" as const, label: "Replace", icon: Repeat },
                { id: "refund" as const, label: "Refund", icon: RotateCcw },
              ] as const
            ).map((entry) => {
              const Icon = entry.icon;
              const active = mode === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={pending}
                  onClick={() => {
                    setMode(entry.id);
                    setError(null);
                    setCashOnHand("");
                  }}
                  className={[
                    "flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-body font-medium transition-colors",
                    active
                      ? "bg-surface text-primary shadow-xs ring-1 ring-primary/15"
                      : "text-ink-muted hover:text-ink",
                  ].join(" ")}
                >
                  <Icon size={15} strokeWidth={2} />
                  {entry.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-sm border border-border bg-paper px-3 py-3 text-caption">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-muted">Originally charged</span>
              <Money value={originalCharged} className="font-semibold text-ink" />
            </div>
            <p className="mt-1 text-ink-muted">
              {item.quantity} × {formatMoney(item.unitPrice)}
            </p>
          </div>

          {mode === "replace" ? (
            <>
              <ProductPicker
                selected={product}
                onSelect={(next) => {
                  setProduct(next);
                  setCashOnHand("");
                }}
                search={searchProductsForReplace}
                label="Replacement product"
              />

              <Field label="Quantity" hint={`Originally sold as ${item.quantity}.`} required>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0.001}
                  step="0.001"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="num"
                />
              </Field>

              {replacementTotal !== null && delta !== null ? (
                <div className="space-y-2 rounded-sm border border-border px-3 py-3 text-caption">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Replacement total</span>
                    <Money value={replacementTotal} className="font-semibold text-ink" />
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">
                      {delta > 0 ? "Customer still owes" : delta < 0 ? "Refund to customer" : "Even swap"}
                    </span>
                    <Money
                      value={Math.abs(delta)}
                      className={
                        delta > 0
                          ? "font-semibold text-warning-ink"
                          : delta < 0
                            ? "font-semibold text-success"
                            : "font-semibold text-ink"
                      }
                    />
                  </div>
                </div>
              ) : null}

              {amountDue > 0 ? (
                <Field
                  label="Cash on hand"
                  hint="Notes the customer hands over for the difference."
                  required
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={cashOnHand}
                    onChange={(event) => setCashOnHand(event.target.value)}
                    className="num"
                    placeholder={amountDue.toFixed(2)}
                  />
                </Field>
              ) : null}

              {amountDue > 0 && cashValid ? (
                <div className="flex items-center gap-2 rounded-sm border border-success/30 bg-success/10 px-3 py-2 text-caption text-success">
                  <Banknote size={14} strokeWidth={2} />
                  Change <Money value={change} className="font-semibold" />
                </div>
              ) : null}

              {refundDue > 0 && mode === "replace" ? (
                <div className="flex items-center gap-2 rounded-sm border border-warning/30 bg-warning/10 px-3 py-2 text-caption text-warning-ink">
                  <Banknote size={14} strokeWidth={2} />
                  Hand back <Money value={refundDue} className="font-semibold" />
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-sm border border-warning/30 bg-warning/10 px-3 py-3 text-body text-warning-ink">
              <Banknote size={16} strokeWidth={2} className="shrink-0" />
              <span>
                Refund to customer:{" "}
                <Money value={refundDue} className="font-semibold" />
              </span>
            </div>
          )}

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close} disabled={pending}>
              Cancel
            </Button>
            {mode === "replace" ? (
              <Button
                icon={Repeat}
                loading={pending}
                onClick={confirmReplace}
                disabled={!product || !qtyValid || !cashValid}
              >
                {pending ? "Replacing..." : "Replace item"}
              </Button>
            ) : (
              <Button icon={RotateCcw} loading={pending} onClick={confirmRefund} variant="danger">
                {pending ? "Refunding..." : "Refund item"}
              </Button>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
