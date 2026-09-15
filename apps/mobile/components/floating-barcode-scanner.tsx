import { useRef, useState } from "react";
import { PanResponder, Pressable, Text, useWindowDimensions, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useAudioPlayer } from "expo-audio";
import { GripHorizontal, MoveDiagonal2, ScanLine, TriangleAlert, X } from "lucide-react-native";
import { Button } from "@/components/ui";
import { circleRadius, color, fontSize, radius, space } from "@/theme";

/** Roughly the old 170×220 aspect ratio, just smaller — the bubble sits over whatever screen is underneath, so default footprint matters more here than on a full-screen scanner. */
const DEFAULT_SIZE = { width: 130, height: 168 };
const MIN_SIZE = { width: 100, height: 130 };
const MAX_SIZE = { width: 260, height: 336 };
/** Distance from each screen edge the bubble starts docked at — same numbers the old hardcoded `right`/`bottom` style used. */
const DEFAULT_POSITION = { right: space.md, bottom: space.xl * 2 };
/** Never let a drag push the bubble fully off an edge — this much of it always stays on-screen and reachable. */
const EDGE_MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [requesting, setRequesting] = useState(false);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [position, setPosition] = useState<{ right: number; bottom: number }>(DEFAULT_POSITION);
  const successPlayer = useAudioPlayer(SUCCESS_SOUND);
  const notFoundPlayer = useAudioPlayer(NOT_FOUND_SOUND);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const handlingRef = useRef(false);
  // Both PanResponders below are created once (useRef) and their callbacks
  // close over refs, never over state directly — a closure over state
  // captured at creation time would go stale after the first drag/resize.
  // Kept in sync on every render (plain assignment, no effect needed for a
  // ref) so onPanResponderGrant always reads what this render actually has.
  const currentSizeRef = useRef(size);
  currentSizeRef.current = size;
  const currentPositionRef = useRef(position);
  currentPositionRef.current = position;
  // gesture.dx/dy (react-native's PanResponder) are relative to where THIS
  // drag started, not the previous frame — onPanResponderMove needs the
  // size/position AT GRANT TIME to add that delta onto, not whatever state
  // has become mid-drag (which would double-apply the movement).
  const sizeAtGrantRef = useRef(size);
  const positionAtGrantRef = useRef(position);

  const resizeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        sizeAtGrantRef.current = currentSizeRef.current;
      },
      onPanResponderMove: (_event, gesture) => {
        // The bubble is anchored by `right`/`bottom` (fixed screen position),
        // so its top-left corner is the one that actually moves as size
        // changes — width/height grow toward the top-left, the handle's own
        // corner. Dragging left/up (negative dx/dy) grows the box; the sign
        // flip below is that, not a mistake.
        const start = sizeAtGrantRef.current;
        setSize({
          width: clamp(start.width - gesture.dx, MIN_SIZE.width, MAX_SIZE.width),
          height: clamp(start.height - gesture.dy, MIN_SIZE.height, MAX_SIZE.height),
        });
      },
    }),
  ).current;

  const moveResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        positionAtGrantRef.current = currentPositionRef.current;
      },
      onPanResponderMove: (_event, gesture) => {
        // `right`/`bottom` are distances FROM those edges — dragging right
        // (positive dx) moves the bubble closer to the right edge, so that
        // distance shrinks; dragging down shrinks `bottom` the same way.
        // Clamped against the current window size so a drag can never push
        // the bubble fully off an edge and out of reach.
        const start = positionAtGrantRef.current;
        const { width, height } = currentSizeRef.current;
        setPosition({
          right: clamp(
            start.right - gesture.dx,
            EDGE_MARGIN,
            Math.max(EDGE_MARGIN, screenWidth - width - EDGE_MARGIN),
          ),
          bottom: clamp(
            start.bottom - gesture.dy,
            EDGE_MARGIN,
            Math.max(EDGE_MARGIN, screenHeight - height - EDGE_MARGIN),
          ),
        });
      },
    }),
  ).current;

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
          right: position.right,
          bottom: position.bottom,
          width: size.width,
          height: size.height,
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

        {/* Top-center, clear of the resize handle (left) and close button
            (right) below — the whole bubble is small enough that any bigger
            drag target would overlap one of those. */}
        <View
          {...moveResponder.panHandlers}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Move barcode scanner"
          accessibilityHint="Drag to reposition"
          hitSlop={8}
          style={{
            position: "absolute",
            top: space.xs,
            left: "50%",
            marginLeft: -18,
            width: 36,
            height: 18,
            borderRadius: radius.sm,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <GripHorizontal size={14} color={color.onPrimary} strokeWidth={2.5} />
        </View>

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

        {/* Top-left — the bubble is anchored by right/bottom, so that's the
            one corner that actually moves as size changes (see the sign
            flip in onPanResponderMove above). Any other corner would drag
            backwards from what the cashier's finger is doing.
            MoveDiagonal2 (arrows pointing OUT of a corner), not Maximize2
            (arrows pointing IN, reads as a tap-to-fullscreen button) — this
            handle only drags to resize, it was never meant to be tappable,
            and a fullscreen mode is the opposite of what this component is
            for (small floating preview over the rest of the app). */}
        <View
          {...resizeResponder.panHandlers}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Resize barcode scanner"
          accessibilityHint="Drag to resize"
          hitSlop={8}
          style={{
            position: "absolute",
            top: space.xs,
            left: space.xs,
            width: 30,
            height: 30,
            borderRadius: circleRadius(30),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <MoveDiagonal2 size={14} color={color.onPrimary} strokeWidth={2.5} />
        </View>
      </View>
    </View>
  );
}
