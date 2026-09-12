import { useEffect, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { Check, Printer } from "lucide-react-native";
import {
  RECEIPT_COLUMNS,
  RECEIPT_PAPER_WIDTH_MM,
  RECEIPT_PRINTER_MODEL,
  type ReceiptLayout,
} from "@double-a/shared-types";
import { updateReceiptLayout } from "@double-a/api-client/queries";
import { getAdminApiClient } from "@/lib/api/session";
import { useInvalidateSettings, useReceiptLayout } from "@/lib/query/settings";
import { Button, Card, ErrorNote, SectionTitle, SuccessNote } from "@/components/ui";
import { LoadingState } from "@/components/loading-state";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, radius, space, styles } from "@/theme";

const TOGGLES: { key: keyof ReceiptLayout; label: string; hint: string }[] = [
  { key: "showShopName", label: "Shop name", hint: "Centered at the top." },
  {
    key: "showLogoLine",
    label: "Logo placeholder",
    hint: "Prints [logo] under the name. Bitmap logos are not on PT-210 yet.",
  },
  { key: "showAddress", label: "Address", hint: "From store settings." },
  { key: "showPhone", label: "Phone", hint: "From store settings." },
  { key: "showCashier", label: "Cashier name", hint: "Who unlocked the terminal." },
  { key: "showTerminal", label: "Terminal id", hint: "Short device id." },
  {
    key: "showCustomer",
    label: "Customer block",
    hint: "Only when the sale has customer details.",
  },
  { key: "showDiscounts", label: "Discount line", hint: "When a counter discount exists." },
  { key: "showPayment", label: "Payment method", hint: "Cash, E-Wallet, card…" },
  { key: "showFooter", label: "Footer", hint: "Store receipt footer, or “Thank you”." },
];

/** The ~10 print toggles as Switch rows. paperWidthMm/columns/printerModel are
 * locked to the shop's one printer and are never sent in the update payload. */
export default function AdminReceiptScreen() {
  const layoutQuery = useReceiptLayout();
  const invalidate = useInvalidateSettings();

  const [layout, setLayout] = useState<ReceiptLayout | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (layoutQuery.data) setLayout(layoutQuery.data);
  }, [layoutQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!layout) return;
      return updateReceiptLayout(getAdminApiClient(), {
        showShopName: layout.showShopName,
        showAddress: layout.showAddress,
        showPhone: layout.showPhone,
        showLogoLine: layout.showLogoLine,
        showCashier: layout.showCashier,
        showTerminal: layout.showTerminal,
        showCustomer: layout.showCustomer,
        showDiscounts: layout.showDiscounts,
        showPayment: layout.showPayment,
        showFooter: layout.showFooter,
      });
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not save."),
  });

  if (layoutQuery.isPending || !layout) {
    return <LoadingState text="Loading receipt layout…" />;
  }

  if (layoutQuery.isError) {
    return (
      <View style={{ padding: space.md }}>
        <ErrorNote>
          {layoutQuery.error instanceof Error
            ? layoutQuery.error.message
            : "Could not load receipt layout."}
        </ErrorNote>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <WaveBackdrop />
      <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }}>
      <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
        <SectionTitle
          icon={Printer}
          title="Receipt layout"
          hint="What prints on every receipt this terminal makes."
        />

        {TOGGLES.map(({ key, label, hint }) => (
          <View
            key={key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              paddingVertical: space.xs,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
                {label}
              </Text>
              <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>{hint}</Text>
            </View>
            <Switch
              value={layout[key] as boolean}
              onValueChange={(value) =>
                setLayout((previous) => (previous ? { ...previous, [key]: value } : previous))
              }
            />
          </View>
        ))}

        <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
          Locked to {RECEIPT_PRINTER_MODEL}, {RECEIPT_PAPER_WIDTH_MM}mm paper, {RECEIPT_COLUMNS}{" "}
          characters per line.
        </Text>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {save.isSuccess && !error ? (
          <SuccessNote>Saved. Terminals pick this up on their next sync.</SuccessNote>
        ) : null}

        <Button
          label={save.isPending ? "Saving…" : "Save layout"}
          icon={Check}
          busy={save.isPending}
          onPress={() => save.mutate()}
        />
      </Card>
      </ScrollView>
    </View>
  );
}
