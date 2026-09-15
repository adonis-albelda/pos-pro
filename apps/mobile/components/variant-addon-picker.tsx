import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Check, Circle, CircleCheck, Minus, Plus, Square, SquareCheck } from "lucide-react-native";
import {
  formatMoney,
  roundMoney,
  type AddonGroup,
  type ProductVariant,
} from "@double-a/shared-types";
import { variantAttributeLabel } from "@/db/product-variants";
import { BottomSheet } from "@/components/bottom-sheet";
import { CartQtyButton } from "@/components/cart-qty-button";
import { Badge, Button, Money } from "@/components/ui";
import { useLayout } from "@/lib/layout";
import { color, fontSize, radius, space } from "@/theme";

/** Wider than BottomSheet's own 560 default — tablet held sideways has room to spare, and this dialog's variant list is worth spreading out instead of staying phone-width. */
const TABLET_LANDSCAPE_MAX_WIDTH = 720;

export interface PickedAddon {
  addonGroupItemId: string;
  name: string;
  price: number;
}

export interface VariantAddonSelection {
  variant: ProductVariant;
  addons: PickedAddon[];
}

/**
 * Before-add-to-cart step for a product with more than one variant, and/or
 * one or more attached add-on groups (CLAUDE.md Phase 3 — plan section on
 * the POS variant/add-on picker). Never shown for a plain single-variant,
 * no-add-ons product; that path is untouched (`addToCart` in app/pos/index
 * decides whether to open this at all).
 *
 * With no add-on groups, a 2+ variant product renders one row per variant
 * with its own qty stepper — the sheet stays open across adds, since
 * picking one variant is never the cashier's only intent when a product
 * has several. Every stepper tap resolves through the caller's own
 * out-of-stock/commit path (`onAdjust`), same as the old single-shot flow.
 * With add-on groups present, the original radio-select-then-checkboxes
 * flow stays (an add-on combo is picked per specific add, not per row) —
 * confirming there adds and resets the form instead of closing, so a
 * second variant/add-on combo can follow without reopening the sheet.
 */
export function VariantAddonPicker({
  open,
  productName,
  productBrandName,
  productPhotoUrl,
  variants,
  addonGroups,
  quantities,
  onCancel,
  onAdjust,
  onConfirm,
}: {
  open: boolean;
  productName: string;
  productBrandName?: string | null;
  /** Shown for a variant with no photo of its own — same fallback ProductVariantResource already resolves server-side, kept here too for whatever hasn't re-synced since. */
  productPhotoUrl?: string | null;
  variants: ProductVariant[];
  addonGroups: AddonGroup[];
  /** Current cart quantity per variant id — drives the row steppers and,
   * for the add-on flow, the read-only "in cart" count next to each row. */
  quantities: Map<string, number>;
  onCancel: () => void;
  /** No-add-on path: +/- tapped directly on a variant row. */
  onAdjust: (variant: ProductVariant, delta: 1 | -1) => void;
  /** Add-on path: full selection confirmed — sheet stays open, caller decides whether to close. */
  onConfirm: (selection: VariantAddonSelection) => void;
}) {
  const [variantId, setVariantId] = useState<string | null>(null);
  // groupId -> selected addon_group_item ids
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const { compact, landscape } = useLayout();
  const dialogMaxWidth = !compact && landscape ? TABLET_LANDSCAPE_MAX_WIDTH : undefined;
  const hasAddons = addonGroups.length > 0;

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
        if (item) sum += item.price;
      }
    }
    return roundMoney(sum);
  }, [addonGroups, picks]);

  const total = roundMoney((selectedVariant?.price ?? 0) + addonsTotal);

  // Sum of every variant row's own price × its current cart qty — the
  // running total for this product across whichever variants are already
  // in the cart, not the in-progress add-on combo below (that's `total`).
  const variantsCartTotal = useMemo(() => {
    let sum = 0;
    for (const variant of variants) {
      sum += variant.price * (quantities.get(variant.id) ?? 0);
    }
    return roundMoney(sum);
  }, [variants, quantities]);

  function confirm() {
    if (!selectedVariant || missingRequired.length > 0) return;

    const addons: PickedAddon[] = [];
    for (const group of addonGroups) {
      for (const itemId of picks[group.id] ?? []) {
        const item = group.items.find((entry) => entry.id === itemId);
        if (item) addons.push({ addonGroupItemId: item.id, name: item.name, price: item.price });
      }
    }

    onConfirm({ variant: selectedVariant, addons });
    // Ready for another add in the same sheet — the caller decides whether
    // to actually keep it open (a single-variant, add-on-only picker still
    // closes on its own).
    setPicks({});
  }

  return (
    <BottomSheet open={open} onClose={onCancel} maxWidth={dialogMaxWidth}>
      <View style={{ gap: space.md }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space.sm,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm, flex: 1 }}>
            <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
              {productName}
            </Text>
            {productBrandName ? <Badge tone="neutral" label={productBrandName} /> : null}
          </View>
          {variantsCartTotal > 0 ? (
            <Money value={variantsCartTotal} style={{ fontSize: fontSize.headingSm, fontWeight: "700" }} />
          ) : null}
        </View>

        {variants.length > 1 ? (
          <View style={{ gap: space.xs }}>
            <Text style={{ fontSize: fontSize.caption, fontWeight: "700", color: color.inkMuted }}>
              VARIANTS
            </Text>
            {variants.map((variant) => {
              const label = variantAttributeLabel(variant) || variant.sku || "Default";
              const photoUrl = variant.photoUrl ?? productPhotoUrl ?? null;
              const qty = quantities.get(variant.id) ?? 0;
              const outOfStock = variant.stockQuantity <= 0;
              const selected = variant.id === variantId;

              return (
                <View
                  key={variant.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.sm,
                    paddingVertical: space.sm,
                    paddingHorizontal: space.md,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: (hasAddons ? selected : qty > 0) ? color.primary : color.border,
                    backgroundColor: (hasAddons ? selected : qty > 0) ? color.primarySoft : color.surface,
                  }}
                >
                  <Pressable
                    onPress={() => setVariantId(variant.id)}
                    disabled={!hasAddons}
                    accessibilityRole={hasAddons ? "radio" : undefined}
                    accessibilityState={hasAddons ? { selected } : undefined}
                    style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1 }}
                  >
                    {hasAddons ? (
                      selected ? (
                        <CircleCheck size={20} color={color.primary} strokeWidth={2} />
                      ) : (
                        <Circle size={20} color={color.inkMuted} strokeWidth={2} />
                      )
                    ) : null}
                    {photoUrl ? (
                      <Image
                        source={{ uri: photoUrl }}
                        style={{ width: 32, height: 32, borderRadius: radius.sm }}
                      />
                    ) : null}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{
                          fontSize: fontSize.body,
                          fontWeight: (hasAddons ? selected : qty > 0) ? "700" : "500",
                          color: color.ink,
                        }}
                      >
                        {label}
                      </Text>
                      <Text
                        style={{
                          fontSize: fontSize.caption,
                          color: outOfStock ? color.danger : color.inkMuted,
                        }}
                      >
                        {outOfStock ? "Out of stock" : `${variant.stockQuantity} in stock`}
                        {qty > 0 ? ` · ${qty} in cart` : ""}
                      </Text>
                    </View>
                    <Text style={[{ fontSize: fontSize.body, color: color.inkMuted }]}>
                      {formatMoney(variant.price)}
                    </Text>
                  </Pressable>

                  {hasAddons ? null : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                      <CartQtyButton
                        icon={Minus}
                        label={`One less ${label}`}
                        disabled={qty === 0}
                        onPress={() => onAdjust(variant, -1)}
                      />
                      <Text
                        style={{
                          minWidth: 20,
                          textAlign: "center",
                          fontSize: fontSize.body,
                          fontWeight: "700",
                          color: color.ink,
                        }}
                      >
                        {qty}
                      </Text>
                      <CartQtyButton
                        icon={Plus}
                        label={`One more ${label}`}
                        onPress={() => onAdjust(variant, 1)}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        {addonGroups.map((group) => (
          <View key={group.id} style={{ gap: space.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <Text
                style={{ fontSize: fontSize.caption, fontWeight: "700", color: color.inkMuted }}
              >
                {group.name.toUpperCase()}
              </Text>
              {group.isRequired ? <Badge tone="warning" label="Required" /> : null}
            </View>
            {group.items.map((item) => {
              const selected = (picks[group.id] ?? []).includes(item.id);
              const CheckIcon =
                group.selectionType === "single"
                  ? selected
                    ? CircleCheck
                    : Circle
                  : selected
                    ? SquareCheck
                    : Square;
              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    group.selectionType === "single"
                      ? toggleSingle(group, item.id)
                      : toggleMultiple(group, item.id)
                  }
                  accessibilityRole={group.selectionType === "single" ? "radio" : "checkbox"}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.sm,
                    paddingVertical: space.sm,
                    paddingHorizontal: space.md,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: selected ? color.primary : color.border,
                    backgroundColor: pressed
                      ? color.primarySoft
                      : selected
                        ? color.primarySoft
                        : color.surface,
                  })}
                >
                  <CheckIcon size={18} color={selected ? color.primary : color.inkMuted} strokeWidth={2} />
                  {item.photoUrl ? (
                    <Image
                      source={{ uri: item.photoUrl }}
                      style={{ width: 28, height: 28, borderRadius: radius.sm }}
                    />
                  ) : null}
                  <Text style={{ flex: 1, fontSize: fontSize.body, color: color.ink }}>
                    {item.name}
                  </Text>
                  {item.price > 0 ? (
                    <Text style={{ fontSize: fontSize.body, color: color.inkMuted }}>
                      +{formatMoney(item.price)}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}

        {hasAddons ? (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: space.sm,
                borderTopWidth: 1,
                borderColor: color.border,
              }}
            >
              <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink }}>
                Total
              </Text>
              <Money value={total} style={{ fontSize: fontSize.headingSm, fontWeight: "700" }} />
            </View>

            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button label="Done" variant="secondary" style={{ flex: 1 }} onPress={onCancel} />
              <Button
                label="Add to cart"
                icon={Check}
                style={{ flex: 1 }}
                disabled={!selectedVariant || missingRequired.length > 0}
                onPress={confirm}
              />
            </View>
          </>
        ) : (
          <Button label="Done" style={{ width: "100%" }} onPress={onCancel} />
        )}
      </View>
    </BottomSheet>
  );
}
