import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useAudioPlayer } from "expo-audio";
import { ScanLine, TriangleAlert, X } from "lucide-react-native";
import { Button } from "@/components/ui";
import { circleRadius, color, fontSize, radius, space } from "@/theme";

/** Same set BarcodeScanModal reads — retail barcodes plus qr, nothing this app ever prints outside those. */
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

// eslint-disable-next-line @typescript-eslint/no-require-imports -- static asset require, same pattern as every other bundled asset in this app
const SUCCESS_SOUND = require("../assets/sounds/scan-success.wav");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
const NOT_FOUND_SOUND = require("../assets/sounds/scan-not-found.wav");

/**
 * A code still framed by the camera fires onBarcodeScanned on every
 * preview tick, not once — without this, holding one barcode in view for
 * a second would add it a dozen times. A different code scanned right
 * after is never held back by this, only a repeat of the same one.
 */
const RESCAN_COOLDOWN_MS = 1500;

/**
 * Continuous scan-to-cart, unlike BarcodeScanModal (one shot, full screen,
 * closes the instant a code reads — built for filling the search box, not
 * for ringing up a stack of items back to back). This stays open as a
 * small floating preview over whatever screen is already showing — the
 * cashier can keep tapping tiles, opening the cart, anything else, while
 * it keeps listening — and only ever closes when they tap its own X.
 * `onScan` does the actual product lookup + cart add and reports back
 * whether it matched, purely so this knows which sound to play.
 */
export function FloatingBarcodeScanner({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => Promise<boolean>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [requesting, setRequesting] = useState(false);
  const successPlayer = useAudioPlayer(SUCCESS_SOUND);
  const notFoundPlayer = useAudioPlayer(NOT_FOUND_SOUND);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const handlingRef = useRef(false);

  if (!open) return null;

  async function handleScan(result: BarcodeScanningResult) {
    const code = result.data.trim();
    if (!code || handlingRef.current) return;

    const now = Date.now();
    const last = lastScanRef.current;
    if (last && last.code === code && now - last.at < RESCAN_COOLDOWN_MS) return;
    lastScanRef.current = { code, at: now };

    handlingRef.current = true;
    try {
      const matched = await onScan(code);
      const player = matched ? successPlayer : notFoundPlayer;
      player.seekTo(0);
      player.play();
    } finally {
      handlingRef.current = false;
    }
  }

  async function askPermission() {
    setRequesting(true);
    await requestPermission();
    setRequesting(false);
  }

  const granted = permission?.granted ?? false;
  const canAskAgain = permission?.canAskAgain ?? true;

  return (
    // box-none: this full-screen layer only exists to anchor the bubble's
    // absolute position — every tap outside the bubble itself must reach
    // the real screen underneath, that's the whole "floating" point.
    <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <View
        style={{
          position: "absolute",
          right: space.md,
          bottom: space.xl * 2,
          width: 170,
          height: 220,
          borderRadius: radius.lg,
          overflow: "hidden",
          backgroundColor: color.ink,
          borderWidth: 2,
          borderColor: color.primary,
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 16,
        }}
      >
        {granted ? (
          <>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={(result) => void handleScan(result)}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 14,
                left: 14,
                right: 14,
                bottom: 14,
                borderRadius: radius.sm,
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.7)",
              }}
            />
          </>
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: space.sm,
              gap: space.sm,
            }}
          >
            <TriangleAlert size={22} color={color.dangerInk} strokeWidth={2} />
            <Text
              style={{ fontSize: fontSize.caption, color: color.onPrimary, textAlign: "center" }}
            >
              {canAskAgain ? "Needs camera access" : "Camera off in Settings"}
            </Text>
            {canAskAgain ? (
              <Button label="Allow" icon={ScanLine} busy={requesting} onPress={() => void askPermission()} />
            ) : null}
          </View>
        )}

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close barcode scanner"
          hitSlop={8}
          style={{
            position: "absolute",
            top: space.xs,
            right: space.xs,
            width: 30,
            height: 30,
            borderRadius: circleRadius(30),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <X size={16} color={color.onPrimary} strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  );
}
