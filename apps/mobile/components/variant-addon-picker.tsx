import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Check, Circle, CircleCheck, Square, SquareCheck } from "lucide-react-native";
import {
  formatMoney,
  roundMoney,
  type AddonGroup,
  type ProductVariant,
} from "@double-a/shared-types";
import { variantAttributeLabel } from "@/db/product-variants";
import { BottomSheet } from "@/components/bottom-sheet";
import { Badge, Button, Money } from "@/components/ui";
import { color, fontSize, radius, space } from "@/theme";

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
 */
export function VariantAddonPicker({
  open,
  productName,
  variants,
  addonGroups,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  productName: string;
  variants: ProductVariant[];
  addonGroups: AddonGroup[];
  onCancel: () => void;
  onConfirm: (selection: VariantAddonSelection) => void;
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
        if (item) sum += item.price;
      }
    }
    return roundMoney(sum);
  }, [addonGroups, picks]);

  const total = roundMoney((selectedVariant?.price ?? 0) + addonsTotal);

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
  }

  return (
    <BottomSheet open={open} onClose={onCancel}>
      <View style={{ gap: space.md }}>
        <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
          {productName}
        </Text>

        {variants.length > 1 ? (
          <View style={{ gap: space.xs }}>
            <Text style={{ fontSize: fontSize.caption, fontWeight: "700", color: color.inkMuted }}>
              CHOOSE ONE
            </Text>
            {variants.map((variant) => {
              const selected = variant.id === variantId;
              const label = variantAttributeLabel(variant) || variant.sku || "Default";
              return (
                <Pressable
                  key={variant.id}
                  onPress={() => setVariantId(variant.id)}
                  accessibilityRole="radio"
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
                  {selected ? (
                    <CircleCheck size={20} color={color.primary} strokeWidth={2} />
                  ) : (
                    <Circle size={20} color={color.inkMuted} strokeWidth={2} />
                  )}
                  <Text
                    style={{
                      flex: 1,
                      fontSize: fontSize.body,
                      fontWeight: selected ? "700" : "500",
                      color: color.ink,
                    }}
                  >
                    {label}
                  </Text>
                  <Text style={[{ fontSize: fontSize.body, color: color.inkMuted }]}>
                    {formatMoney(variant.price)}
                  </Text>
                </Pressable>
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
          <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onCancel} />
          <Button
            label="Add to cart"
            icon={Check}
            style={{ flex: 1 }}
            disabled={!selectedVariant || missingRequired.length > 0}
            onPress={confirm}
          />
        </View>
      </View>
    </BottomSheet>
  );
}
