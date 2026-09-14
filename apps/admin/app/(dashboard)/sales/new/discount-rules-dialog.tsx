"use client";

import { useState } from "react";
import { CheckCircle2, Gift, Percent, Sparkles, Tag, X, type LucideIcon } from "lucide-react";
import type { CartLine, ComplexDiscountRule, DiscountRule, LoyaltyReward, TaxSettings } from "@double-a/shared-types";
import { formatMoney } from "@double-a/shared-types";
import { Button, Field, Input, Money, MoneyInput } from "@/components/ui";
import { Dialog } from "@/components/overlay";
import {
  applyComplexRuleToCart,
  applyLoyaltyRewardToCart,
  applySimpleRuleToCart,
  type AppliedOrderDiscount,
} from "@/lib/order-discounts";

function RuleRow({
  icon: Icon = Percent,
  label,
  sub,
  active,
  onClick,
}: {
  icon?: LucideIcon;
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active}
      className={`flex w-full items-center gap-2.5 rounded-sm border px-3 py-2 text-left transition-colors ${
        active ? "border-primary bg-primary-tint" : "border-border bg-surface hover:border-primary/40"
      }`}
    >
      <Icon size={16} className={active ? "text-primary" : "text-ink-muted"} strokeWidth={2} />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium text-ink">{label}</span>
        <span className="block text-caption text-ink-muted">{sub}</span>
      </span>
      {active ? <CheckCircle2 size={16} className="text-primary" strokeWidth={2} /> : null}
    </button>
  );
}

/**
 * One dialog for every way to discount this sale — mirrors the mobile POS's
 * own DiscountSheet, plus the flat whole-cart amount admin already had,
 * folded in here instead of a second dialog. Left column: every discount
 * the system currently detects for this cart/customer — a simple rule
 * (Senior/PWD, Employee, custom), a loyalty reward the customer's points
 * clear, or a complex promo whose conditions the cart already meets —
 * re-derived by the caller on every cart change, so this list is always
 * live. Right column: a manual flat amount, split across every line by its
 * share of the total (the old "discount the whole cart" behavior).
 */
export function DiscountRulesDialog({
  open,
  onClose,
  simpleRules,
  loyaltyMatches,
  complexRules,
  applied,
  lines,
  tax,
  onApply,
  onRemove,
  total,
  lineDiscount,
  discountDraft,
  onDiscountDraftChange,
  onApplyWholeDiscount,
  onClearWholeDiscount,
}: {
  open: boolean;
  onClose: () => void;
  simpleRules: DiscountRule[];
  loyaltyMatches: { reward: LoyaltyReward; rule: DiscountRule }[];
  complexRules: ComplexDiscountRule[];
  applied: AppliedOrderDiscount[];
  lines: CartLine[];
  tax: TaxSettings;
  onApply: (discount: AppliedOrderDiscount) => void;
  onRemove: (id: string) => void;
  total: number;
  lineDiscount: number;
  discountDraft: string;
  onDiscountDraftChange: (value: string) => void;
  onApplyWholeDiscount: () => void;
  onClearWholeDiscount: () => void;
}) {
  const [pendingRule, setPendingRule] = useState<DiscountRule | null>(null);
  const [idNumber, setIdNumber] = useState("");
  const [idHolderName, setIdHolderName] = useState("");

  function isApplied(predicate: (entry: AppliedOrderDiscount) => boolean): boolean {
    return applied.some(predicate);
  }

  function pickSimpleRule(rule: DiscountRule) {
    if (rule.requiresIdNumber) {
      setPendingRule(rule);
      return;
    }
    onApply(applySimpleRuleToCart({ rule, lines, tax }));
  }

  function confirmPendingRule() {
    if (!pendingRule) return;
    onApply(
      applySimpleRuleToCart({
        rule: pendingRule,
        lines,
        tax,
        idNumber: idNumber.trim() || null,
        idHolderName: idHolderName.trim() || null,
      }),
    );
    setPendingRule(null);
    setIdNumber("");
    setIdHolderName("");
  }

  const nothingQualifies = 0 === simpleRules.length && 0 === loyaltyMatches.length && 0 === complexRules.length;

  return (
    <Dialog
      open={open}
      onClose={() => {
        setPendingRule(null);
        onClose();
      }}
      title="Discount this sale"
      description="Every discount the system currently detects for this cart, plus a manual whole-cart amount."
      className="!w-[80vw] max-w-none"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-5">
          <p className="text-caption font-semibold text-ink-muted">DETECTED FOR THIS CART</p>

          {pendingRule ? (
            <div className="space-y-3 rounded-sm border border-primary-soft bg-primary-tint p-3">
              <p className="text-body font-semibold text-ink">{pendingRule.name} needs an ID</p>
              <Field label="ID number" required={false}>
                <Input
                  value={idNumber}
                  onChange={(event) => setIdNumber(event.target.value)}
                  placeholder="Senior/PWD ID #"
                />
              </Field>
              <Field label="ID holder name" required={false}>
                <Input
                  value={idHolderName}
                  onChange={(event) => setIdHolderName(event.target.value)}
                  placeholder="Name on the ID"
                />
              </Field>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setPendingRule(null)}>
                  Cancel
                </Button>
                <Button type="button" className="flex-1" onClick={confirmPendingRule}>
                  Apply
                </Button>
              </div>
            </div>
          ) : (
            <>
              {simpleRules.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-caption font-semibold text-ink-muted">DISCOUNT RULES</p>
                  {simpleRules.map((rule) => {
                    const active = isApplied((entry) => entry.discountRuleId === rule.id && !entry.loyaltyRewardId);
                    return (
                      <RuleRow
                        key={rule.id}
                        label={rule.name}
                        sub={`${"percentage" === rule.type ? `${rule.value}%` : formatMoney(rule.value)} off${
                          rule.isVatExempt ? " · VAT-exempt" : ""
                        }`}
                        active={active}
                        onClick={() => pickSimpleRule(rule)}
                      />
                    );
                  })}
                </div>
              ) : null}

              {loyaltyMatches.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-caption font-semibold text-ink-muted">LOYALTY REWARDS</p>
                  {loyaltyMatches.map(({ reward, rule }) => {
                    const active = isApplied((entry) => entry.loyaltyRewardId === reward.id);
                    return (
                      <RuleRow
                        key={reward.id}
                        icon={Gift}
                        label={reward.name}
                        sub={`${reward.pointsRequired} pts · via ${rule.name}`}
                        active={active}
                        onClick={() => onApply(applyLoyaltyRewardToCart({ reward, rule, lines, tax }))}
                      />
                    );
                  })}
                </div>
              ) : null}

              {complexRules.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-caption font-semibold text-ink-muted">QUALIFYING PROMOS</p>
                  {complexRules.map((rule) => (
                    <RuleRow
                      key={rule.id}
                      icon={Sparkles}
                      label={rule.name}
                      sub="Conditions met"
                      active={false}
                      onClick={() => onApply(applyComplexRuleToCart({ rule, lines }))}
                    />
                  ))}
                </div>
              ) : null}

              {nothingQualifies ? (
                <p className="py-6 text-center text-body text-ink-muted">
                  Nothing qualifies for this cart right now.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="space-y-5">
          <div className="space-y-3 rounded-sm border border-border bg-paper p-4">
            <p className="flex items-center gap-1.5 text-caption font-semibold text-ink-muted">
              <Tag size={13} strokeWidth={2.5} />
              WHOLE-CART DISCOUNT
            </p>
            <Field label="Discount amount" required={false}>
              <MoneyInput
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={discountDraft}
                onChange={(event) => onDiscountDraftChange(event.target.value)}
              />
            </Field>
            {Number(discountDraft) > total ? (
              <p className="text-caption text-ink-muted">Capped at {formatMoney(total)} — the cart&rsquo;s current total.</p>
            ) : null}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                icon={CheckCircle2}
                disabled={!(Number(discountDraft) > 0)}
                onClick={onApplyWholeDiscount}
              >
                Apply discount
              </Button>
              {lineDiscount > 0 ? (
                <Button type="button" variant="secondary" onClick={onClearWholeDiscount}>
                  Clear whole-cart discount
                </Button>
              ) : null}
            </div>
            <p className="text-caption text-ink-muted">
              Split across every line by its share of the total, so it still shows per item on the receipt.
            </p>
          </div>

          {applied.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-caption font-semibold text-ink-muted">APPLIED RULES &amp; REWARDS</p>
              {applied.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded-sm bg-warning/10 px-3 py-2"
                >
                  <span className="text-body text-ink">{entry.name ?? "Discount"}</span>
                  <div className="flex items-center gap-2">
                    <Money
                      value={entry.discountAmount + (entry.vatRemoved ?? 0)}
                      className="text-body font-semibold text-warning-ink"
                    />
                    <button
                      type="button"
                      onClick={() => onRemove(entry.id)}
                      aria-label={`Remove ${entry.name ?? "discount"}`}
                      className="text-ink-muted hover:text-danger"
                    >
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <Button type="button" variant="secondary" className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
