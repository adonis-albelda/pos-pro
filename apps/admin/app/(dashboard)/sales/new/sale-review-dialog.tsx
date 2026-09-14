"use client";

import { useEffect, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Gift,
  HandCoins,
  Package,
  Receipt,
  Smartphone,
  Truck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { formatMoney, roundMoney } from "@double-a/shared-types";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/overlay";

function noop(): void {}

export type PaymentMethod = "cash" | "ewallet" | "card" | "credit";

const PAYMENT_METHOD_META: Record<PaymentMethod, { label: string; icon: LucideIcon }> = {
  cash: { label: "Cash", icon: Banknote },
  ewallet: { label: "E-Wallet", icon: Smartphone },
  card: { label: "Card", icon: CreditCard },
  credit: { label: "Credit", icon: HandCoins },
};

/** Round to whole bills at or above what's owed — same quick-cash picks as the mobile POS's own confirm sheet. */
function quickCashOptions(amountDue: number): number[] {
  return [50, 100, 200, 500, 1000]
    .map((bill) => roundMoney(Math.ceil(amountDue / bill) * bill))
    .filter((next, index, all) => next > amountDue && all.indexOf(next) === index)
    .slice(0, 3);
}

function DetailRow({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-sm border border-border bg-paper px-3 py-2.5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
        <Icon size={16} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-caption text-ink-muted">{label}</p>
        <p className="truncate text-body font-semibold text-ink">{value}</p>
        {sub ? <p className="truncate text-caption text-ink-muted">{sub}</p> : null}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, tone, prefix }: { label: string; value: number; tone?: "success"; prefix?: string }) {
  return (
    <div className="flex-1 px-3 py-2 text-center">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className={`num text-body font-semibold ${tone === "success" ? "text-success" : "text-ink"}`}>
        {prefix}
        {formatMoney(value)}
      </p>
    </div>
  );
}

/**
 * Web port of the mobile POS's own pre-checkout review (apps/mobile/app/pos/
 * index.tsx's ConfirmSaleSheet) — same shape: payment method (with the
 * e-wallet provider named), fulfillment, customer, amount due, a shelf/
 * discount/change strip, and — for cash — a cash-on-hand entry that gates
 * the confirm button until it actually covers the total. Card/e-wallet/
 * credit skip straight to "Customer pays by X."
 */
export function SaleReviewDialog({
  open,
  succeeded,
  pending,
  shelfTotal,
  discount,
  amountDue,
  itemCount,
  paymentMethod,
  ewalletProvider,
  fulfillment,
  customerName,
  customerContact,
  customerAddress,
  onClose,
  onConfirm,
  onViewSale,
  onNewSale,
  showAwardPointsButton = false,
  awardPointsPending = false,
  onAwardPoints,
}: {
  open: boolean;
  succeeded: boolean;
  pending: boolean;
  shelfTotal: number;
  discount: number;
  amountDue: number;
  itemCount: number;
  paymentMethod: PaymentMethod;
  ewalletProvider: string | null;
  fulfillment: "pickup" | "delivery";
  customerName: string | null;
  customerContact: string | null;
  customerAddress: string | null;
  onClose: () => void;
  onConfirm: () => void;
  onViewSale: () => void;
  onNewSale: () => void;
  /** True when this sale's total matched a manual-only earning tier — see AwardLoyaltyPointsController. */
  showAwardPointsButton?: boolean;
  awardPointsPending?: boolean;
  onAwardPoints?: () => void;
}) {
  const [cashDraft, setCashDraft] = useState(() => amountDue.toFixed(2));

  useEffect(() => {
    if (open) setCashDraft(amountDue.toFixed(2));
  }, [open, amountDue]);

  const isCash = "cash" === paymentMethod;
  const cashOnHand = Number(cashDraft);
  const cashValid = Number.isFinite(cashOnHand) && cashOnHand >= amountDue;
  const change = cashValid ? roundMoney(cashOnHand - amountDue) : 0;
  const canConfirm = !isCash || cashValid;
  const method = PAYMENT_METHOD_META[paymentMethod];
  const methodLabel = ewalletProvider ? `${method.label} · ${ewalletProvider}` : method.label;

  return (
    <Dialog
      open={open}
      onClose={pending ? noop : onClose}
      title={succeeded ? "Sale complete" : "Confirm sale"}
      className="!w-[80vw] max-w-none"
    >
      {succeeded ? (
        <div className="flex flex-col items-center gap-4 px-2 py-6 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 size={32} strokeWidth={2} />
          </span>
          <div>
            <p className="text-heading-sm font-semibold text-ink">Sale created successfully</p>
            <p className="mt-1 text-body text-ink-muted">
              View the receipt, or start ringing up the next sale.
            </p>
          </div>
          {showAwardPointsButton ? (
            <Button
              type="button"
              variant="secondary"
              icon={Gift}
              loading={awardPointsPending}
              disabled={awardPointsPending}
              className="w-full"
              onClick={onAwardPoints}
            >
              {awardPointsPending ? "Awarding..." : "Award loyalty points"}
            </Button>
          ) : null}
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <Button type="button" variant="secondary" icon={Receipt} className="w-full sm:flex-1" onClick={onViewSale}>
              View sale
            </Button>
            <Button type="button" icon={CheckCircle2} className="w-full sm:flex-1" onClick={onNewSale}>
              New sale
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <DetailRow icon={method.icon} label="Payment method" value={methodLabel} />
            <DetailRow
              icon={"delivery" === fulfillment ? Truck : Package}
              label="Fulfillment"
              value={"delivery" === fulfillment ? "Delivery" : "Pickup"}
            />
            <DetailRow
              icon={UserRound}
              label="Customer"
              value={customerName?.trim() || "Walk-in"}
              sub={[customerContact, customerAddress].filter(Boolean).join(" · ") || undefined}
            />
          </div>

          <div className="space-y-3">
            <div className="space-y-1 rounded-md border border-primary-soft bg-primary-tint px-4 py-3 text-center">
              <p className="text-caption font-semibold tracking-wide text-primary-dark uppercase">Amount to pay</p>
              <p className="num text-heading-lg font-bold text-primary-dark">{formatMoney(amountDue)}</p>
              <p className="text-caption font-semibold text-ink">
                {itemCount} item{1 === itemCount ? "" : "s"}
              </p>
            </div>

            <div className="flex overflow-hidden rounded-sm border border-border">
              <SummaryStat label="Shelf total" value={shelfTotal} />
              <div className="w-px bg-border" />
              <SummaryStat label="Discount" value={discount} prefix={discount > 0 ? "-" : undefined} />
              {isCash && cashValid ? (
                <>
                  <div className="w-px bg-border" />
                  <SummaryStat label="Change" value={change} tone="success" />
                </>
              ) : null}
            </div>

            {isCash ? (
              <div className="space-y-2">
                <p className="text-caption font-semibold text-ink">Cash on hand</p>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  autoFocus
                  value={cashDraft}
                  onChange={(event) => setCashDraft(event.target.value)}
                  className={`num w-full rounded-sm border-2 px-3 py-2.5 text-heading-sm font-bold outline-none ${
                    cashValid ? "border-primary bg-primary-tint text-primary-dark" : "border-danger bg-danger/10 text-danger"
                  }`}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCashDraft(amountDue.toFixed(2))}
                    className="rounded-sm border border-primary-soft bg-primary-tint px-3 py-1.5 text-body font-semibold text-primary hover:bg-primary-soft"
                  >
                    Exact
                  </button>
                  {quickCashOptions(amountDue).map((bill) => (
                    <button
                      key={bill}
                      type="button"
                      onClick={() => setCashDraft(bill.toFixed(2))}
                      className="rounded-sm border border-border bg-surface px-3 py-1.5 text-body font-semibold text-ink hover:bg-canvas"
                    >
                      {formatMoney(bill)}
                    </button>
                  ))}
                </div>
                {!cashValid ? (
                  <p className="text-caption font-medium text-danger">Cash on hand must cover {formatMoney(amountDue)}.</p>
                ) : null}
              </div>
            ) : (
              <p className="text-center text-body text-ink-muted">
                Customer pays by {method.label}. No cash change.
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="secondary" className="w-full sm:flex-1" disabled={pending} onClick={onClose}>
                Back to cart
              </Button>
              <Button
                type="button"
                icon={CheckCircle2}
                loading={pending}
                disabled={!canConfirm || pending}
                className="w-full sm:flex-1"
                onClick={onConfirm}
              >
                {pending ? "Creating..." : "Confirm and complete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
