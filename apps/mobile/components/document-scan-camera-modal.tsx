import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Buffer } from "buffer";
import jpeg from "jpeg-js";
import { Camera, TriangleAlert, X } from "lucide-react-native";
import {
  assessDocumentScan,
  rgbaBrightness,
  rgbaMotion,
  rgbaSharpness,
  scanQualityMessage,
  type ScanQuality,
} from "@double-a/shared-types";
import { Button } from "@/components/ui";
import { color, fontSize, radius, space } from "@/theme";

const ANALYSIS_MS = 700;

function frameBorderColor(quality: ScanQuality): string {
  if (quality === "ready") return color.success;
  if (quality === "hold_steady" || quality === "blurry") return color.warning;
  if (quality === "too_dark" || quality === "too_bright") return color.danger;
  return color.onPrimary;
}

function statusBackground(quality: ScanQuality): string {
  if (quality === "ready") return color.success;
  if (quality === "hold_steady" || quality === "blurry") return color.warning;
  if (quality === "too_dark" || quality === "too_bright") return color.danger;
  return "rgba(27, 31, 29, 0.82)";
}

function decodePreviewBase64(base64: string): { data: Uint8ClampedArray; width: number; height: number } | null {
  try {
    const decoded = jpeg.decode(Buffer.from(base64, "base64"), { useTArray: true });
    if (!decoded.width || !decoded.height) return null;
    return {
      data: new Uint8ClampedArray(decoded.data),
      width: decoded.width,
      height: decoded.height,
    };
  } catch {
    return null;
  }
}

function centerCrop(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const cropW = Math.round(width * 0.86);
  const cropH = Math.round(height * 0.62);
  const offsetX = Math.round((width - cropW) / 2);
  const offsetY = Math.round((height - cropH) / 2);
  const out = new Uint8ClampedArray(cropW * cropH * 4);

  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const src = ((offsetY + y) * width + (offsetX + x)) * 4;
      const dst = (y * cropW + x) * 4;
      out[dst] = rgba[src]!;
      out[dst + 1] = rgba[src + 1]!;
      out[dst + 2] = rgba[src + 2]!;
      out[dst + 3] = rgba[src + 3]!;
    }
  }

  return { data: out, width: cropW, height: cropH };
}

/**
 * Document-style camera — live frame, corner brackets, quality hints before capture.
 * Same cues as OEM text-scan modes (light, blur, steady, green when ready).
 */
export function DocumentScanCameraModal({
  open,
  onCaptured,
  onClose,
}: {
  open: boolean;
  onCaptured: (uri: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [requesting, setRequesting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [quality, setQuality] = useState<ScanQuality>("align");
  const cameraRef = useRef<CameraView>(null);
  const motionRef = useRef<Uint8ClampedArray | null>(null);
  const steadyRef = useRef(0);
  const analysingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      motionRef.current = null;
      steadyRef.current = 0;
      setQuality("align");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !permission?.granted) return;

    const timer = setInterval(() => {
      void (async () => {
        if (!cameraRef.current || analysingRef.current || capturing) return;
        analysingRef.current = true;
        try {
          const preview = await cameraRef.current.takePictureAsync({
            quality: 0.12,
            base64: true,
            skipProcessing: true,
            exif: false,
          });
          if (!preview?.base64) return;

          const decoded = decodePreviewBase64(preview.base64);
          if (!decoded) return;

          const crop = centerCrop(decoded.data, decoded.width, decoded.height);
          const metrics = {
            brightness: rgbaBrightness(crop.data),
            sharpness: rgbaSharpness(crop.data, crop.width, crop.height),
            motion: rgbaMotion(crop.data, motionRef.current),
          };
          motionRef.current = crop.data.slice();

          const blocking = assessDocumentScan(metrics, 0);
          if (blocking !== "align") {
            steadyRef.current = 0;
            setQuality(blocking);
          } else {
            steadyRef.current += 1;
            setQuality(assessDocumentScan(metrics, steadyRef.current));
          }
        } catch {
          // Preview frame skipped — camera busy or not ready yet.
        } finally {
          analysingRef.current = false;
        }
      })();
    }, ANALYSIS_MS);

    return () => clearInterval(timer);
  }, [open, permission?.granted, capturing]);

  async function askPermission() {
    setRequesting(true);
    await requestPermission();
    setRequesting(false);
  }

  async function capture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.88 });
      if (photo?.uri) onCaptured(photo.uri);
    } finally {
      setCapturing(false);
    }
  }

  if (!open) return null;

  const granted = permission?.granted ?? false;
  const canAskAgain = permission?.canAskAgain ?? true;
  const borderColor = frameBorderColor(quality);

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: color.ink }}>
        {granted ? (
          <>
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />

            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(27,31,29,0.35)" }]}
            />

            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: "19%",
                left: "7%",
                right: "7%",
                bottom: "31%",
                borderWidth: 2,
                borderColor,
                borderRadius: radius.sm,
              }}
            >
              <View style={{ position: "absolute", left: -1, top: -1, width: 22, height: 22, borderLeftWidth: 3, borderTopWidth: 3, borderColor }} />
              <View style={{ position: "absolute", right: -1, top: -1, width: 22, height: 22, borderRightWidth: 3, borderTopWidth: 3, borderColor }} />
              <View style={{ position: "absolute", left: -1, bottom: -1, width: 22, height: 22, borderLeftWidth: 3, borderBottomWidth: 3, borderColor }} />
              <View style={{ position: "absolute", right: -1, bottom: -1, width: 22, height: 22, borderRightWidth: 3, borderBottomWidth: 3, borderColor }} />
            </View>

            <View
              style={{
                position: "absolute",
                left: space.lg,
                right: space.lg,
                bottom: 148,
                borderRadius: radius.sm,
                paddingHorizontal: space.md,
                paddingVertical: space.sm,
                backgroundColor: statusBackground(quality),
              }}
            >
              <Text
                style={{
                  textAlign: "center",
                  fontSize: fontSize.body,
                  fontWeight: "600",
                  color: quality === "hold_steady" || quality === "blurry" ? color.warningInk : color.onPrimary,
                }}
              >
                {scanQualityMessage(quality)}
              </Text>
            </View>

            <Pressable
              onPress={() => void capture()}
              disabled={capturing}
              accessibilityRole="button"
              accessibilityLabel="Capture photo"
              style={{
                position: "absolute",
                bottom: space.xl + 8,
                alignSelf: "center",
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: color.onPrimary,
                borderWidth: 4,
                borderColor: quality === "ready" ? color.success : "rgba(255,255,255,0.45)",
                alignItems: "center",
                justifyContent: "center",
                opacity: capturing ? 0.6 : 1,
              }}
            >
              <Camera size={30} color={quality === "ready" ? color.success : color.inkMuted} strokeWidth={2} />
            </Pressable>
          </>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.lg }}>
            <TriangleAlert size={36} color={color.onPrimary} strokeWidth={2} />
            <Text style={{ fontSize: fontSize.body, color: color.onPrimary, textAlign: "center" }}>
              {canAskAgain
                ? "Needs camera access to scan a document."
                : "Camera access is off for this app. Turn it on in Settings."}
            </Text>
            {canAskAgain ? (
              <Button label="Allow camera" icon={Camera} busy={requesting} onPress={() => void askPermission()} />
            ) : null}
          </View>
        )}

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          style={{ position: "absolute", top: space.xl, right: space.lg }}
        >
          <X size={24} color={color.onPrimary} strokeWidth={2} />
        </Pressable>
      </View>
    </Modal>
  );
}
