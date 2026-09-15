import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { formatMoney, roundMoney } from "@double-a/shared-types";
import { BottomSheet } from "@/components/bottom-sheet";
import { color, fontSize, radius, space } from "@/theme";

/**
 * Cashier enters the selling price when shelf/variant price is ₱0
 * (ready-catalog imports land at zero until the shop sets a real price).
 */
export function OpenPriceSheet({
  open,
  productName,
  variantLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  productName: string;
  variantLabel?: string | null;
  onCancel: () => void;
  onConfirm: (price: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const typed = Number(draft.replace(/,/g, ""));
  const valid = draft.trim() !== "" && Number.isFinite(typed) && typed > 0;

  useEffect(() => {
    if (!open) setDraft("");
  }, [open]);

  return (
    <BottomSheet open={open} onClose={onCancel} scroll={false}>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}>
        <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
          Enter price
        </Text>
        <Text style={{ fontSize: fontSize.body, color: color.inkMuted, lineHeight: 20 }}>
          {productName}
          {variantLabel ? ` · ${variantLabel}` : ""} has no shelf price. Type what to charge.
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            backgroundColor: color.surface,
          }}
        >
          <Text style={{ fontSize: fontSize.headingSm, color: color.inkMuted, marginRight: space.sm }}>
            ₱
          </Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={color.inkMuted}
            autoFocus
            style={{
              flex: 1,
              fontSize: 24,
              fontWeight: "600",
              color: color.ink,
              paddingVertical: space.md,
            }}
            onSubmitEditing={() => {
              if (valid) onConfirm(roundMoney(typed));
            }}
          />
        </View>
        {valid ? (
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
            Charge {formatMoney(typed)}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
          <Pressable
            onPress={onCancel}
            style={{
              flex: 1,
              paddingVertical: space.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: color.border,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.ink }}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (valid) onConfirm(roundMoney(typed));
            }}
            disabled={!valid}
            style={{
              flex: 1,
              paddingVertical: space.md,
              borderRadius: radius.md,
              backgroundColor: valid ? color.primary : color.border,
              alignItems: "center",
              opacity: valid ? 1 : 0.6,
            }}
          >
            <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: "#fff" }}>
              Add to cart
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}
