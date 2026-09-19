import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { ApiError } from "@double-a/api-client";
import { changePin, updateMe } from "@double-a/api-client/queries";
import { PIN_LENGTH_MAX, PIN_LENGTH_MIN } from "@double-a/shared-types";
import { ensureFreshSession, getSelfServiceApiClient } from "@/lib/api/session";
import { useLayout } from "@/lib/layout";
import { cacheLocalPin } from "@/lib/pin";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { Badge, Button, Card, ErrorNote, SectionTitle, SuccessNote } from "@/components/ui";
import { Check, Clock, KeyRound, ShieldCheck } from "lucide-react-native";
import { circleRadius, color, fontSize, radius, space, styles } from "@/theme";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return first ?? error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).replace(/_/g, " ");
}

/**
 * On-shift cashier's own info — identity, role, PIN, idle timeout. Reached
 * from the account drawer, not the tab bar — a shift visits it occasionally,
 * not every screen switch.
 */
export default function AccountScreen() {
  const layout = useLayout();
  const { cashier, updateCashier } = useSession();
  const store = useStoreSettings();

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  const [idleMinutesInput, setIdleMinutesInput] = useState(
    cashier && cashier.idleTimeoutMinutes !== null ? String(cashier.idleTimeoutMinutes) : "",
  );
  const [idleBusy, setIdleBusy] = useState(false);
  const [idleError, setIdleError] = useState<string | null>(null);
  const [idleMessage, setIdleMessage] = useState<string | null>(null);

  if (!cashier) return null;

  async function submitChangePin() {
    if (!cashier) return;
    setPinError(null);
    setPinMessage(null);

    if (newPin.length < PIN_LENGTH_MIN || newPin.length > PIN_LENGTH_MAX) {
      setPinError(`PIN must be ${PIN_LENGTH_MIN}-${PIN_LENGTH_MAX} digits.`);
      return;
    }
    if (newPin !== confirmPin) {
      setPinError("Those two PINs don't match.");
      return;
    }
    if (cashier.hasPin && currentPin.length < PIN_LENGTH_MIN) {
      setPinError("Enter your current PIN.");
      return;
    }

    setPinBusy(true);
    try {
      await ensureFreshSession();
      const client = getSelfServiceApiClient();
      await changePin(client, {
        currentPin: cashier.hasPin ? currentPin : undefined,
        pin: newPin,
      });
      await cacheLocalPin(cashier.id, newPin);
      updateCashier({ hasPin: true });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setPinMessage("PIN changed.");
    } catch (cause) {
      setPinError(errorMessage(cause, "Could not change the PIN."));
    } finally {
      setPinBusy(false);
    }
  }

  async function submitIdleTimeout() {
    if (!cashier) return;
    setIdleError(null);
    setIdleMessage(null);

    const trimmed = idleMinutesInput.trim();
    const idleTimeoutMinutes = trimmed === "" ? null : Number(trimmed);
    if (idleTimeoutMinutes !== null && (!Number.isFinite(idleTimeoutMinutes) || idleTimeoutMinutes < 0 || idleTimeoutMinutes > 120)) {
      setIdleError("Enter a number of minutes between 0 and 120, or leave it blank.");
      return;
    }

    setIdleBusy(true);
    try {
      await ensureFreshSession();
      const client = getSelfServiceApiClient();
      const updated = await updateMe(client, { idleTimeoutMinutes });
      updateCashier({ idleTimeoutMinutes: updated.idleTimeoutMinutes });
      setIdleMessage(
        idleTimeoutMinutes === null
          ? `Saved. Using the shop default (${store.idleTimeoutMinutes} min).`
          : "Saved.",
      );
    } catch (cause) {
      setIdleError(errorMessage(cause, "Could not save the idle timeout."));
    } finally {
      setIdleBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: layout.gutter,
          gap: layout.compact ? space.lg : space.xl,
          width: "100%",
          maxWidth: layout.readableMaxWidth,
          alignSelf: "center",
        }}
      >
        <View
          style={{
            gap: space.md,
            // Bleeds past the screen's own padding on every side that touches
            // it — top and sides — to reach the true edge, same treatment as
            // the Sales screen's date-filter panel.
            marginTop: -layout.gutter,
            marginHorizontal: -layout.gutter,
            paddingHorizontal: layout.gutter,
            paddingTop: layout.gutter,
            paddingBottom: space.md,
            backgroundColor: color.primarySoft,
            borderBottomWidth: 1,
            borderBottomColor: color.border,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: circleRadius(56),
                backgroundColor: color.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.onPrimary }}>
                {cashier.name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text numberOfLines={1} style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                {cashier.name}
              </Text>
              <Badge tone="neutral" label={roleLabel(cashier.role)} icon={null} />
            </View>
          </View>

          <Row label="Username" value={cashier.username || "Not set"} />
          <Row label="Email" value={cashier.email ?? "Not set"} />
          <Row label="Branch" value={store.name} />
        </View>

        <View style={{ gap: space.sm }}>
          <SectionTitle icon={ShieldCheck} title="Account status" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {cashier.canSell ? (
              <Badge tone="success" label="Can complete sales" />
            ) : (
              <Badge tone="warning" label="Cannot complete sales" />
            )}
            <Badge
              tone={cashier.hasPin ? "success" : "warning"}
              label={cashier.hasPin ? "PIN set" : "No PIN set"}
            />
          </View>
        </View>

        <Card style={{ gap: space.md }}>
          <SectionTitle
            icon={KeyRound}
            title="Change PIN"
            hint={cashier.hasPin ? "Used to unlock this terminal." : "No PIN set yet — set one below."}
          />

          {cashier.hasPin ? (
            <Labelled label="Current PIN">
              <TextInput
                value={currentPin}
                onChangeText={setCurrentPin}
                placeholder="••••"
                placeholderTextColor={color.inkMuted}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={PIN_LENGTH_MAX}
                style={inputStyle}
              />
            </Labelled>
          ) : null}

          <Labelled label="New PIN">
            <TextInput
              value={newPin}
              onChangeText={setNewPin}
              placeholder={`${PIN_LENGTH_MIN}-${PIN_LENGTH_MAX} digits`}
              placeholderTextColor={color.inkMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={PIN_LENGTH_MAX}
              style={inputStyle}
            />
          </Labelled>

          <Labelled label="Confirm new PIN">
            <TextInput
              value={confirmPin}
              onChangeText={setConfirmPin}
              placeholder={`${PIN_LENGTH_MIN}-${PIN_LENGTH_MAX} digits`}
              placeholderTextColor={color.inkMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={PIN_LENGTH_MAX}
              style={inputStyle}
            />
          </Labelled>

          {pinError ? <ErrorNote>{pinError}</ErrorNote> : null}
          {pinMessage ? <SuccessNote>{pinMessage}</SuccessNote> : null}

          <Button
            label={pinBusy ? "Saving…" : "Save PIN"}
            icon={Check}
            busy={pinBusy}
            onPress={() => void submitChangePin()}
          />
        </Card>

        <Card style={{ gap: space.md }}>
          <SectionTitle
            icon={Clock}
            title="Idle timeout"
            hint={`Shop default is ${store.idleTimeoutMinutes} min. Leave blank to use it.`}
          />
          <Labelled label="Lock me after (minutes)">
            <TextInput
              value={idleMinutesInput}
              onChangeText={setIdleMinutesInput}
              placeholder={String(store.idleTimeoutMinutes)}
              placeholderTextColor={color.inkMuted}
              keyboardType="number-pad"
              style={inputStyle}
            />
          </Labelled>

          {idleError ? <ErrorNote>{idleError}</ErrorNote> : null}
          {idleMessage ? <SuccessNote>{idleMessage}</SuccessNote> : null}

          <Button
            label={idleBusy ? "Saving…" : "Save"}
            icon={Check}
            busy={idleBusy}
            onPress={() => void submitIdleTimeout()}
          />
        </Card>
      </ScrollView>
    </View>
  );
}

const inputStyle = {
  minHeight: 48,
  borderWidth: 1,
  borderColor: color.border,
  borderRadius: radius.md,
  backgroundColor: color.surface,
  paddingHorizontal: space.md,
  fontSize: fontSize.bodyLg,
  color: color.ink,
} as const;

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted, fontWeight: "600" }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={[styles.muted, { fontWeight: "500" }]}>{label}</Text>
      <Text
        numberOfLines={1}
        style={{
          fontSize: fontSize.body,
          fontWeight: "600",
          color: color.ink,
          flexShrink: 1,
          marginLeft: space.md,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
