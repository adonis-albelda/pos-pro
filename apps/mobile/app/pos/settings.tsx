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
import {
  RECEIPT_COLUMNS,
  RECEIPT_PAPER_WIDTH_MM,
  RECEIPT_PRINTER_MODEL,
  timeAgo,
} from "@double-a/shared-types";
import { getSyncMeta } from "@/db/meta";
import { countLocalProducts } from "@/db/products";
import { countPendingSales } from "@/db/sales";
import { countLocalUsers } from "@/db/users";
import { getDeviceId, getDeviceLabel } from "@/lib/device";
import { useLayout } from "@/lib/layout";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { useSync } from "@/sync/sync-provider";
import { ensureBluetoothPermissions } from "@/printing/bluetooth-permissions";
import { buildReceipt, getPrinterSettings, savePrinterSettings } from "@/printing/receipt";
import { transportFor, type PrinterSettings } from "@/printing/transport";
import {
  Bluetooth,
  Check,
  FileText,
  LogOut,
  Printer,
  RefreshCw,
  Send,
  Smartphone,
  Store,
} from "lucide-react-native";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { Badge, Button, Card, ErrorNote, SectionTitle, SuccessNote } from "@/components/ui";
import { color, fontSize, radius, space, styles } from "@/theme";

interface BtDevice {
  id: string;
  name: string;
}

export default function SettingsScreen() {
  const router = useRouter();
  const layout = useLayout();
  const { lock } = useSession();
  const { dataVersion } = useSync();
  const store = useStoreSettings();

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

  return (
    <View style={styles.screen}>
      <WaveBackdrop />
      <ScrollView
        contentContainerStyle={{
          padding: layout.gutter,
          gap: space.lg,
          width: "100%",
          maxWidth: layout.readableMaxWidth,
          alignSelf: "center",
        }}
      >
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
                    borderRadius: 12,
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
      </ScrollView>
    </View>
  );
}

const inputStyle = {
  minHeight: 48,
  borderWidth: 1,
  borderColor: color.border,
  borderRadius: 12,
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
