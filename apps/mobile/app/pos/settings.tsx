import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ApiError } from "@double-a/api-client";
import { changePin, updateMe } from "@double-a/api-client/queries";
import {
  PIN_LENGTH_MAX,
  PIN_LENGTH_MIN,
  RECEIPT_COLUMNS,
  RECEIPT_PAPER_WIDTH_MM,
  RECEIPT_PRINTER_MODEL,
  timeAgo,
} from "@double-a/shared-types";
import { getSyncMeta } from "@/db/meta";
import { countLocalProducts } from "@/db/products";
import { countPendingSales } from "@/db/sales";
import { countLocalUsers } from "@/db/users";
import { ensureFreshSession, getSelfServiceApiClient } from "@/lib/api/session";
import { getDeviceId, getDeviceLabel } from "@/lib/device";
import { useLayout } from "@/lib/layout";
import { cacheLocalPin } from "@/lib/pin";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { useSync } from "@/sync/sync-provider";
import { ensureBluetoothPermissions } from "@/printing/bluetooth-permissions";
import { buildReceipt, getPrinterSettings, savePrinterSettings } from "@/printing/receipt";
import { transportFor, type PrinterSettings } from "@/printing/transport";
import {
  Bluetooth,
  Check,
  Clock,
  FileText,
  KeyRound,
  LogOut,
  Printer,
  RefreshCw,
  Send,
  Smartphone,
  Store,
  User as UserIcon,
} from "lucide-react-native";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { Badge, Button, Card, ErrorNote, SectionTitle, SuccessNote } from "@/components/ui";
import { color, fontSize, radius, space, styles } from "@/theme";

interface BtDevice {
  id: string;
  name: string;
}

type SettingsTab = "general" | "printer" | "account";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return first ?? error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

export default function SettingsScreen() {
  const router = useRouter();
  const layout = useLayout();
  const { cashier, lock, updateCashier } = useSession();
  const { dataVersion } = useSync();
  const store = useStoreSettings();

  const [tab, setTab] = useState<SettingsTab>("general");

  const [settings, setSettings] = useState<PrinterSettings | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("9100");
  const [devices, setDevices] = useState<BtDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [info, setInfo] = useState({
    deviceId: "",
    label: "",
    products: 0,
    users: 0,
    pending: 0,
    lastSyncedAt: null as string | null,
  });

  // Account tab — change PIN.
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  // Account tab — personal idle timeout override.
  const [idleMinutesInput, setIdleMinutesInput] = useState(
    cashier && cashier.idleTimeoutMinutes !== null ? String(cashier.idleTimeoutMinutes) : "",
  );
  const [idleBusy, setIdleBusy] = useState(false);
  const [idleError, setIdleError] = useState<string | null>(null);
  const [idleMessage, setIdleMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const stored = await getPrinterSettings();
      setSettings(stored);
      setHost(stored.host ?? "");
      setPort(String(stored.port ?? 9100));

      const [deviceId, label, products, users, pending, meta] = await Promise.all([
        getDeviceId(),
        getDeviceLabel(),
        countLocalProducts(),
        countLocalUsers(),
        countPendingSales(),
        getSyncMeta(),
      ]);

      setInfo({
        deviceId,
        label: label ?? "",
        products,
        users,
        pending,
        lastSyncedAt: meta.lastSyncedAt,
      });
    }

    void load();
  }, [dataVersion]);

  async function loadBluetoothDevices() {
    setError(null);
    setMessage(null);
    setScanning(true);

    try {
      const allowed = await ensureBluetoothPermissions();
      if (!allowed) {
        setError("Bluetooth permission not granted. Allow it to scan for the PT-210.");
        return;
      }

      // Lazy require — Expo Go / missing native module degrades cleanly.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Bluetooth = require("rn-bluetooth-classic-printer") as {
        isBluetoothEnabled: () => boolean;
        requestEnableBluetooth: () => Promise<boolean>;
        getPairedDevices: () => Promise<BtDevice[]>;
        startScanning: (listener: (device: BtDevice) => void) => { remove: () => void };
        stopScanning: () => boolean;
      };

      if (!Bluetooth.isBluetoothEnabled()) {
        await Bluetooth.requestEnableBluetooth();
      }

      const paired = await Bluetooth.getPairedDevices();
      const found = new Map<string, BtDevice>();
      for (const device of paired) found.set(device.id, device);

      setDevices(Array.from(found.values()));

      const subscription = Bluetooth.startScanning((device) => {
        setDevices((previous) => {
          if (previous.some((row) => row.id === device.id)) return previous;
          return [...previous, device];
        });
      });

      await new Promise((resolve) => setTimeout(resolve, 8000));
      subscription.remove();
      Bluetooth.stopScanning();
      setMessage("Scan finished. Tap a PT-210 to pair for receipts.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Bluetooth unavailable: ${cause.message}`
          : "Bluetooth unavailable on this build. Use a dev client.",
      );
    } finally {
      setScanning(false);
    }
  }

  async function save(kind: PrinterSettings["kind"], device?: BtDevice) {
    const next: PrinterSettings = {
      kind,
      host: host.trim() || undefined,
      port: Number(port) || 9100,
      columns: RECEIPT_COLUMNS,
      bluetoothAddress: device?.id ?? settings?.bluetoothAddress,
      bluetoothName: device?.name ?? settings?.bluetoothName,
    };

    if (kind === "network" && !next.host) {
      setError("Enter the printer's address on the shop network.");
      return;
    }
    if (kind === "bluetooth" && !next.bluetoothAddress) {
      setError("Scan and pick a Bluetooth printer first.");
      return;
    }

    if (kind === "bluetooth" && next.bluetoothAddress) {
      const allowed = await ensureBluetoothPermissions();
      if (!allowed) {
        setError("Bluetooth permission not granted. Allow it to connect to the PT-210.");
        return;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Bluetooth = require("rn-bluetooth-classic-printer") as {
          connectDevice: (id: string) => Promise<boolean>;
        };
        await Bluetooth.connectDevice(next.bluetoothAddress);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? `Could not connect: ${cause.message}`
            : "Could not connect to the printer.",
        );
        return;
      }
    }

    await savePrinterSettings(next);
    setSettings(next);
    setError(null);
    setMessage(
      kind === "bluetooth"
        ? `Paired ${next.bluetoothName || next.bluetoothAddress}.`
        : "Printer saved.",
    );
  }

  async function testPrint() {
    if (!settings) return;

    setError(null);
    try {
      const payload = buildReceipt(
        {
          id: "00000000-0000-4000-8000-000000000000",
          invoiceNumber: null,
          userId: null,
          totalAmount: 123.45,
          discountAmount: 0,
          paymentMethod: "cash",
          status: "completed",
          deviceId: info.deviceId,
          createdAt: new Date().toISOString(),
          customerName: null,
          customerAddress: null,
          customerContact: null,
          customerId: null,
          isPaid: true,
          fulfillment: "pickup",
          deliveryCompleted: false,
          syncStatus: "synced",
          syncedAt: null,
          items: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              saleId: "00000000-0000-4000-8000-000000000000",
              productId: null,
              variantId: null,
              productName: "Test item",
              quantity: 1,
              unitPrice: 123.45,
              listPrice: 123.45,
              unitCost: 0,
              subtotal: 123.45,
              replacedByProductId: null,
              replacedByProductName: null,
              refundedAt: null,
              addons: [],
            },
          ],
        },
        { columns: RECEIPT_COLUMNS, cashierName: "Test" },
      );

      await transportFor(settings).send(payload);
      setMessage("Test receipt sent.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Printer did not answer: ${cause.message}`
          : "Printer did not answer.",
      );
    }
  }

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
    <View style={styles.screen}>
      <WaveBackdrop />
      <View
        style={{
          flexDirection: "row",
          gap: space.xs,
          paddingHorizontal: layout.gutter,
          paddingTop: space.sm,
          width: "100%",
          maxWidth: layout.readableMaxWidth,
          alignSelf: "center",
        }}
      >
        <SettingsTabButton label="General" selected={tab === "general"} onPress={() => setTab("general")} />
        <SettingsTabButton
          label="Account"
          icon={UserIcon}
          selected={tab === "account"}
          onPress={() => setTab("account")}
        />
        <SettingsTabButton
          label="Printer"
          icon={Printer}
          selected={tab === "printer"}
          onPress={() => setTab("printer")}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: layout.gutter,
          gap: space.lg,
          width: "100%",
          maxWidth: layout.readableMaxWidth,
          alignSelf: "center",
        }}
      >
      {tab === "general" ? (
        <>
          <Card style={[{ gap: space.sm }, styles.floatShadow, { borderRadius: radius.sm }]}>
            <SectionTitle icon={Smartphone} title="This terminal" />
            <Row label="Name" value={info.label || "Not named"} />
            <Row label="Terminal id" value={info.deviceId.slice(0, 8)} />
            <Row label="Products held" value={String(info.products)} />
            <Row label="Cashiers held" value={String(info.users)} />
            <Row label="Last synced" value={timeAgo(info.lastSyncedAt)} />
            {info.pending > 0 ? (
              <Badge tone="warning" label={`${info.pending} sales waiting to send`} />
            ) : (
              <Badge tone="success" label="All sales sent" />
            )}
          </Card>

          <Card style={[{ gap: space.sm }, styles.floatShadow, { borderRadius: radius.sm }]}>
            <SectionTitle
              icon={Store}
              title="Shop"
              hint="Set in the office. Changes arrive on the next sync."
            />
            <Row label="Name" value={store.name} />
            <Row label="Address" value={store.address ?? "Not set"} />
            <Row label="Phone" value={store.phone ?? "Not set"} />
          </Card>

          <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
            <SectionTitle icon={LogOut} title="Shift" />
            <Button
              label="End shift"
              variant="secondary"
              icon={LogOut}
              onPress={() => {
                lock();
                router.replace("/unlock");
              }}
            />
          </Card>
        </>
      ) : null}

      {tab === "printer" ? (
        <>
          <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
            <SectionTitle
              icon={Bluetooth}
              title="Bluetooth printer"
              hint={`${RECEIPT_PRINTER_MODEL} · ${RECEIPT_PAPER_WIDTH_MM}mm · ${RECEIPT_COLUMNS} cols`}
            />
            <Text style={styles.muted}>
              Pair the PT-210 here. Receipt layout (which blocks print) comes from admin on
              sync — this terminal only stores the Bluetooth device.
            </Text>

            {settings?.kind === "bluetooth" && settings.bluetoothAddress ? (
              <Badge
                tone="success"
                label={`Using ${settings.bluetoothName || settings.bluetoothAddress}`}
              />
            ) : (
              <Badge tone="neutral" label="No Bluetooth printer paired" />
            )}

            <Button
              label={scanning ? "Scanning…" : "Scan / refresh devices"}
              icon={scanning ? undefined : RefreshCw}
              variant="secondary"
              onPress={() => void loadBluetoothDevices()}
              disabled={scanning}
            />
            {scanning ? <ActivityIndicator color={color.primary} /> : null}

            {devices.length > 0 ? (
              <View style={{ gap: space.xs }}>
                {devices.map((device) => {
                  const active =
                    settings?.kind === "bluetooth" &&
                    settings.bluetoothAddress === device.id;
                  return (
                    <Pressable
                      key={device.id}
                      onPress={() => void save("bluetooth", device)}
                      style={{
                        minHeight: 48,
                        borderWidth: 1,
                        borderColor: active ? color.primary : color.border,
                        borderRadius: radius.md,
                        backgroundColor: active ? color.primarySoft : color.surface,
                        paddingHorizontal: space.md,
                        paddingVertical: space.sm,
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.ink }}>
                        {device.name || "Unknown device"}
                      </Text>
                      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                        {device.id}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </Card>

          <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
            <SectionTitle icon={Printer} title="Network printer (optional)" />
            <Text style={styles.muted}>
              LAN ESC/POS on wifi. Prefer Bluetooth for the PT-210 on the counter.
            </Text>

            <Labelled label="Address">
              <TextInput
                value={host}
                onChangeText={setHost}
                placeholder="192.168.1.50"
                placeholderTextColor={color.inkMuted}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                style={inputStyle}
              />
            </Labelled>

            <Labelled label="Port">
              <TextInput
                value={port}
                onChangeText={setPort}
                keyboardType="number-pad"
                style={inputStyle}
              />
            </Labelled>

            <Button
              label="Use network printer"
              icon={Check}
              variant="secondary"
              onPress={() => void save("network")}
            />
          </Card>

          <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
            <SectionTitle icon={Printer} title="Print test" />
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            {message ? <SuccessNote>{message}</SuccessNote> : null}

            <Button
              label="Print to log instead"
              variant="secondary"
              icon={FileText}
              onPress={() => void save("none")}
            />
            <Button
              label="Send a test receipt"
              variant="secondary"
              icon={Send}
              onPress={() => void testPrint()}
            />
          </Card>
        </>
      ) : null}

      {tab === "account" ? (
        <>
          <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
            <SectionTitle
              icon={KeyRound}
              title="Change PIN"
              hint={cashier?.hasPin ? "Used to unlock this terminal." : "No PIN set yet — set one below."}
            />

            {cashier?.hasPin ? (
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

          <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
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
        </>
      ) : null}
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
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.numeric, { fontSize: fontSize.body }]}>{value}</Text>
    </View>
  );
}

function SettingsTabButton({
  label,
  icon: Icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: typeof Printer;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space.xs,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: selected ? color.primary : color.primarySoft,
        backgroundColor: selected ? color.primary : pressed ? color.primarySoft : color.surface,
      })}
    >
      {Icon ? <Icon size={15} color={selected ? color.onPrimary : color.ink} strokeWidth={2.25} /> : null}
      <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: selected ? color.onPrimary : color.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}
