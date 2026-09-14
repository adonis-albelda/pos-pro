"use client";

import { useEffect, useMemo, useState } from "react";
import { Circle, CircleCheck, Square, SquareCheck } from "lucide-react";
import type { AddonGroup, ProductVariant } from "@double-a/api-client/queries";
import { formatMoney, roundMoney } from "@double-a/shared-types";
import { Badge, Button, Money } from "@/components/ui";
import { Dialog } from "@/components/overlay";

/** "Red / L" — blank for a product's only/default variant, which has no combination of its own. */
export function variantLabel(variant: ProductVariant): string {
  return variant.attributeValues.map((value) => value.value).filter(Boolean).join(" / ") || variant.sku || "Default";
}

export interface SaleAddonPick {
  addonGroupItemId: string;
  name: string;
  price: number;
}

export interface SaleVariantAddonSelection {
  variant: ProductVariant;
  addons: SaleAddonPick[];
}

/**
 * Web equivalent of the mobile POS's variant/add-on picker
 * (apps/mobile/components/variant-addon-picker.tsx) — same shape: pick one
 * variant (if the product has more than one), pick required/optional
 * add-ons, confirm. See create-sale-form.tsx's addToCart for when this
 * opens vs. adding a plain product straight to the cart.
 */
export function SaleVariantAddonPicker({
  open,
  productName,
  productBrandName,
  variants,
  addonGroups,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  productName: string;
  productBrandName?: string | null;
  variants: ProductVariant[];
  addonGroups: AddonGroup[];
  onCancel: () => void;
  onConfirm: (selection: SaleVariantAddonSelection) => void;
}) {
  const [variantId, setVariantId] = useState<string | null>(null);
  // groupId -> selected addon_group_item ids
  const [picks, setPicks] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!open) return;
    const defaultVariant = variants.find((v) => v.isDefault) ?? variants[0] ?? null;
    setVariantId(defaultVariant?.id ?? null);
    setPicks({});
  }, [open, variants]);

  const selectedVariant = variants.find((v) => v.id === variantId) ?? null;

  const missingRequired = addonGroups.filter(
    (group) => group.isRequired && (picks[group.id]?.length ?? 0) === 0,
  );

  function toggleSingle(group: AddonGroup, itemId: string) {
    setPicks((current) => ({ ...current, [group.id]: [itemId] }));
  }

  function toggleMultiple(group: AddonGroup, itemId: string) {
    setPicks((current) => {
      const existing = current[group.id] ?? [];
      const next = existing.includes(itemId)
        ? existing.filter((id) => id !== itemId)
        : [...existing, itemId];
      return { ...current, [group.id]: next };
    });
  }

  const addonsTotal = useMemo(() => {
    let sum = 0;
    for (const group of addonGroups) {
      for (const itemId of picks[group.id] ?? []) {
        const item = group.items.find((entry) => entry.id === itemId);
        if (item) sum += item.effectivePrice;
      }
    }
    return roundMoney(sum);
  }, [addonGroups, picks]);

  const total = roundMoney((selectedVariant?.price ?? 0) + addonsTotal);

  function confirm() {
    if (!selectedVariant || missingRequired.length > 0) return;

    const addons: SaleAddonPick[] = [];
    for (const group of addonGroups) {
      for (const itemId of picks[group.id] ?? []) {
        const item = group.items.find((entry) => entry.id === itemId);
        if (item) {
          addons.push({
            addonGroupItemId: item.id,
            name: [item.productName, item.variantLabel].filter(Boolean).join(" · ") || "Add-on",
            price: item.effectivePrice,
          });
        }
      }
    }

    onConfirm({ variant: selectedVariant, addons });
  }

  return (
    <Dialog open={open} onClose={onCancel} title={productName}>
      <div className="space-y-4">
        {productBrandName ? (
          <div>
            <Badge tone="neutral">{productBrandName}</Badge>
          </div>
        ) : null}

        {variants.length > 1 ? (
          <div className="space-y-1.5">
            <p className="text-caption font-semibold text-ink-muted">VARIANTS</p>
            {variants.map((variant) => {
              const selected = variant.id === variantId;
              return (
                <button
                  key={variant.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setVariantId(variant.id)}
                  className={`flex w-full items-center gap-2.5 rounded-sm border px-3 py-2 text-left transition-colors ${
                    selected ? "border-primary bg-primary-tint" : "border-border bg-surface hover:border-primary/40"
                  }`}
                >
                  {selected ? (
                    <CircleCheck size={18} className="shrink-0 text-primary" strokeWidth={2} />
                  ) : (
                    <Circle size={18} className="shrink-0 text-ink-muted" strokeWidth={2} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-body ${selected ? "font-bold" : "font-medium"} text-ink`}>
                      {variantLabel(variant)}
                    </span>
                    <span className={`block text-caption ${variant.stockQuantity !== null && variant.stockQuantity <= 0 ? "text-danger" : "text-ink-muted"}`}>
                      {variant.stockQuantity !== null && variant.stockQuantity <= 0
                        ? "Out of stock"
                        : `${variant.stockQuantity ?? 0} in stock`}
                    </span>
                  </span>
                  <Money value={variant.price} className="text-body text-ink-muted" />
                </button>
              );
            })}
          </div>
        ) : null}

        {addonGroups.map((group) => (
          <div key={group.id} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="text-caption font-semibold text-ink-muted">{group.name.toUpperCase()}</p>
              {group.isRequired ? <Badge tone="warning">Required</Badge> : null}
            </div>
            {group.items.map((item) => {
              const selected = (picks[group.id] ?? []).includes(item.id);
              const CheckIcon =
                "single" === group.selectionType ? (selected ? CircleCheck : Circle) : selected ? SquareCheck : Square;
              const label = [item.productName, item.variantLabel].filter(Boolean).join(" · ") || "Add-on";
              return (
                <button
                  key={item.id}
                  type="button"
                  role={"single" === group.selectionType ? "radio" : "checkbox"}
                  aria-checked={selected}
                  onClick={() =>
                    "single" === group.selectionType
                      ? toggleSingle(group, item.id)
                      : toggleMultiple(group, item.id)
                  }
                  className={`flex w-full items-center gap-2.5 rounded-sm border px-3 py-2 text-left transition-colors ${
                    selected ? "border-primary bg-primary-tint" : "border-border bg-surface hover:border-primary/40"
                  }`}
                >
                  <CheckIcon size={16} className={selected ? "shrink-0 text-primary" : "shrink-0 text-ink-muted"} strokeWidth={2} />
                  <span className="flex-1 text-body text-ink">{label}</span>
                  {item.effectivePrice > 0 ? (
                    <span className="text-body text-ink-muted">+{formatMoney(item.effectivePrice)}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className="text-body font-bold text-ink">Total</p>
          <Money value={total} className="text-heading-sm font-bold" />
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={confirm}
            disabled={!selectedVariant || missingRequired.length > 0}
          >
            Add to cart
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
