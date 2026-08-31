import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { Check, ShieldAlert, Store } from "lucide-react-native";
import { updateStoreSettings } from "@double-a/api-client/queries";
import { getAdminApiClient } from "@/lib/api/session";
import { useSession } from "@/lib/session";
import { useInvalidateSettings, useStoreSettings } from "@/lib/query/settings";
import { useSync } from "@/sync/sync-provider";
import { Button, Card, ErrorNote, SectionTitle, SuccessNote } from "@/components/ui";
import { LoadingState } from "@/components/loading-state";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, radius, space, styles } from "@/theme";

function fieldStyle() {
  return {
    minHeight: 48,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    color: color.ink,
    backgroundColor: color.surface,
  } as const;
}

/** Shop name, address, phone, receipt footer. No logo field — see report: the
 * Tally API has no file-upload endpoint behind `store_settings.logo_url`,
 * same gap apps/admin's StoreForm hits (its file picker just refuses every
 * upload server-side). Nothing here to build a control against. */
export default function AdminSettingsScreen() {
  const { cashier } = useSession();
  const settingsQuery = useStoreSettings();
  const invalidate = useInvalidateSettings();
  const { pullOnly } = useSync();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setName(settingsQuery.data.name);
    setAddress(settingsQuery.data.address ?? "");
    setPhone(settingsQuery.data.phone ?? "");
    setReceiptFooter(settingsQuery.data.receiptFooter ?? "");
  }, [settingsQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error("The shop name is required — it heads every terminal.");
      return updateStoreSettings(getAdminApiClient(), {
        name: trimmedName,
        address: address.trim() || null,
        phone: phone.trim() || null,
        receiptFooter: receiptFooter.trim() || null,
      });
    },
    onSuccess: async () => {
      setError(null);
      invalidate();
      // Saved here goes straight to the live API — this terminal's own local
      // mirror (what StoreHeader, the unlock screen and the account drawer
      // all actually read) otherwise stays stale until the next manual
      // Sync/Refresh. Same pull-only path the Sync tab's Refresh button
      // uses, so this terminal sees its own change immediately.
      await pullOnly();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not save."),
  });

  // Manager reaches everything else under /admin (see _layout.tsx) but not
  // this screen — actsAsOwner() on the server rejects the save anyway
  // (StoreSettingPolicy), this just skips the dead-end form entirely.
  if (cashier?.role === "manager") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md }}>
        <ShieldAlert size={32} color={color.inkMuted} strokeWidth={1.75} />
        <Text style={{ fontSize: fontSize.body, color: color.inkMuted, textAlign: "center" }}>
          Store settings are owner-only.
        </Text>
      </View>
    );
  }

  if (settingsQuery.isPending) {
    return <LoadingState text="Loading store settings…" />;
  }

  if (settingsQuery.isError) {
    return (
      <View style={{ padding: space.md }}>
        <ErrorNote>
          {settingsQuery.error instanceof Error
            ? settingsQuery.error.message
            : "Could not load store settings."}
        </ErrorNote>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <WaveBackdrop />
      <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }}>
      <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
        <SectionTitle icon={Store} title="Store settings" hint="Read by every terminal and receipt." />

        <View style={{ gap: space.xs }}>
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>Shop name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your shop name"
            placeholderTextColor={color.inkMuted}
            style={fieldStyle()}
          />
        </View>

        <View style={{ gap: space.xs }}>
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>Address</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="123 Rizal St, Barangay Poblacion"
            placeholderTextColor={color.inkMuted}
            style={fieldStyle()}
          />
        </View>

        <View style={{ gap: space.xs }}>
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>Phone</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="0917 000 0000"
            placeholderTextColor={color.inkMuted}
            keyboardType="phone-pad"
            style={fieldStyle()}
          />
        </View>

        <View style={{ gap: space.xs }}>
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
            Receipt footer
          </Text>
          <TextInput
            value={receiptFooter}
            onChangeText={setReceiptFooter}
            placeholder="Thank you. No return, no exchange without receipt."
            placeholderTextColor={color.inkMuted}
            multiline
            numberOfLines={3}
            style={[fieldStyle(), { minHeight: 80, paddingTop: space.sm, textAlignVertical: "top" }]}
          />
        </View>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {save.isSuccess && !error ? (
          <SuccessNote>Saved — this terminal is already showing it. Other terminals pick it up on their next sync.</SuccessNote>
        ) : null}

        <Button
          label={save.isPending ? "Saving…" : "Save changes"}
          icon={Check}
          busy={save.isPending}
          onPress={() => save.mutate()}
        />
      </Card>
      </ScrollView>
    </View>
  );
}
