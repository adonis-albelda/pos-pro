import { useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { ScanLine, TriangleAlert, X } from "lucide-react-native";
import { Button } from "@/components/ui";
import { color, fontSize, radius, space } from "@/theme";

/**
 * Retail barcodes, plus qr — the admin Product QR/barcode label sheet
 * (apps/admin/.../product-qr) can print either, and both just encode the
 * plain SKU string. No aztec/pdf417/datamatrix — nothing here prints those.
 */
const BARCODE_TYPES = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "code93",
  "codabar",
  "itf14",
  "qr",
] as const;

/**
 * Camera scan (barcode or QR) for the product search box — beside the mic
 * icon. One scan, one result: the moment a code reads, this fires onResult
 * and closes itself, same as VoiceSearchModal's one-shot shape. A native
 * module (expo-camera) — this terminal's dev client must be rebuilt (`expo
 * prebuild` + a fresh EAS/dev-client build) before this works on device,
 * same as the voice-search/printer/bluetooth modules already here.
 */
export function BarcodeScanModal({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (code: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [requesting, setRequesting] = useState(false);
  const scannedRef = useRef(false);

  if (!open) return null;

  function handleScan(result: BarcodeScanningResult) {
    if (scannedRef.current) return;
    const code = result.data.trim();
    if (!code) return;
    scannedRef.current = true;
    onResult(code);
    onClose();
  }

  function close() {
    scannedRef.current = false;
    onClose();
  }

  async function askPermission() {
    setRequesting(true);
    await requestPermission();
    setRequesting(false);
  }

  const granted = permission?.granted ?? false;
  const canAskAgain = permission?.canAskAgain ?? true;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: color.ink }}>
        {granted ? (
          <>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={handleScan}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                inset: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 260,
                  height: 160,
                  borderRadius: radius.md,
                  borderWidth: 3,
                  borderColor: color.onPrimary,
                }}
              />
              <Text
                style={{
                  marginTop: space.lg,
                  fontSize: fontSize.body,
                  fontWeight: "600",
                  color: color.onPrimary,
                }}
              >
                Point the camera at a barcode or QR code
              </Text>
            </View>
          </>
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: space.xl,
              gap: space.lg,
            }}
          >
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: color.dangerSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <TriangleAlert size={36} color={color.dangerInk} strokeWidth={2} />
            </View>
            <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.onPrimary }}>
              Scan a barcode or QR code
            </Text>
            <Text
              style={{
                fontSize: fontSize.body,
                color: "rgba(255,255,255,0.75)",
                textAlign: "center",
              }}
            >
              {canAskAgain
                ? "Needs camera access to scan a barcode or QR code."
                : "Camera access is off for this app. Turn it on in Settings."}
            </Text>
            {canAskAgain ? (
              <Button
                label="Allow camera"
                icon={ScanLine}
                busy={requesting}
                onPress={() => void askPermission()}
                style={{ borderRadius: 14 }}
              />
            ) : null}
          </View>
        )}

        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Cancel barcode scan"
          hitSlop={8}
          style={{
            position: "absolute",
            top: space.xl,
            right: space.lg,
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <X size={22} color={color.onPrimary} strokeWidth={2} />
        </Pressable>
      </View>
    </Modal>
  );
}
