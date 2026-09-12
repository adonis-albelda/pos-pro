import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, Text, View } from "react-native";
import { Mic, MicOff, TriangleAlert } from "lucide-react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Button } from "@/components/ui";
import { circleRadius, color, fontSize, radius, space } from "@/theme";

type Phase = "requesting" | "listening" | "error";

/**
 * Voice search for the product grid. A native speech-recognition module
 * (expo-speech-recognition) — this terminal's already-installed dev client
 * must be rebuilt (`expo prebuild` + a fresh EAS/dev-client build) before
 * this works on device; adding a native module always invalidates the
 * previously-built client, same as the printer/bluetooth modules already here.
 */
export function VoiceSearchModal({
  open,
  onClose,
  onResult,
  contextualStrings,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
  /** Product/category names to bias recognition toward — the shop's own vocabulary reads far better than generic English. */
  contextualStrings?: string[];
}) {
  const [phase, setPhase] = useState<Phase>("requesting");
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const finishedRef = useRef(false);

  function finish(text: string) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const trimmed = text.trim();
    if (trimmed) onResult(trimmed);
    onClose();
  }

  function startListening() {
    ExpoSpeechRecognitionModule.start({
      // No hardcoded locale — the device's own language setting reads a
      // Filipino/Taglish-speaking cashier far better than a forced en-US.
      interimResults: true,
      continuous: false,
      addsPunctuation: false,
      // Cloud recognition is markedly more accurate than on-device, and this
      // terminal already needs a live connection for everything else it does.
      requiresOnDeviceRecognition: false,
      // Biases recognition toward the shop's actual product/category names —
      // generic dictation badly mishears brand names and hardware terms.
      contextualStrings: contextualStrings?.slice(0, 1000),
    });
  }

  useEffect(() => {
    if (!open) return;

    finishedRef.current = false;
    setPhase("requesting");
    setTranscript("");
    setErrorMessage(null);

    let cancelled = false;

    void ExpoSpeechRecognitionModule.requestPermissionsAsync().then((result) => {
      if (cancelled) return;
      if (!result.granted) {
        setPhase("error");
        setErrorMessage("Microphone access is off for this app. Turn it on in Settings.");
        return;
      }
      setPhase("listening");
      startListening();
    });

    return () => {
      cancelled = true;
      ExpoSpeechRecognitionModule.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contextualStrings is a fresh array each render; only `open` should retrigger this
  }, [open]);

  useSpeechRecognitionEvent("result", (event) => {
    const heard = event.results[0]?.transcript ?? "";
    setTranscript(heard);
    if (event.isFinal) finish(heard);
  });

  useSpeechRecognitionEvent("error", (event) => {
    finishedRef.current = true;
    setPhase("error");
    setErrorMessage(
      event.error === "no-speech"
        ? "Didn't catch that. Try again, closer to the mic."
        : "Voice search could not start. Type the search instead.",
    );
  });

  useSpeechRecognitionEvent("end", () => {
    // Engine stopped without a final result (e.g. it caught something but
    // never marked it final) — use whatever partial transcript we have
    // rather than silently dropping it.
    if (!finishedRef.current && transcript.trim()) finish(transcript);
  });

  function retry() {
    finishedRef.current = false;
    setTranscript("");
    setErrorMessage(null);
    setPhase("listening");
    startListening();
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: `${color.ink}99`,
          alignItems: "center",
          justifyContent: "center",
          padding: space.xl,
        }}
      >
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={{ position: "absolute", inset: 0 }}
        />

        <View
          style={{
            width: "100%",
            maxWidth: 340,
            borderRadius: radius.lg,
            backgroundColor: color.surface,
            borderWidth: 1,
            borderColor: color.borderSoft,
            paddingVertical: space["2xl"],
            paddingHorizontal: space.xl,
            alignItems: "center",
            gap: space.lg,
            shadowColor: "#000",
            shadowOpacity: 0.2,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 14,
          }}
        >
          {phase === "error" ? (
            <>
              <View
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: circleRadius(88),
                  backgroundColor: color.dangerSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <TriangleAlert size={36} color={color.dangerInk} strokeWidth={2} />
              </View>
              <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                Voice search
              </Text>
              <Text style={{ fontSize: fontSize.body, color: color.inkMuted, textAlign: "center" }}>
                {errorMessage}
              </Text>
              <View style={{ flexDirection: "row", gap: space.sm, width: "100%" }}>
                <Button label="Try again" onPress={retry} style={{ flex: 1 }} />
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={onClose}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          ) : (
            <>
              <PulsingMic active={phase === "listening"} />
              <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                {phase === "requesting" ? "One moment…" : "Start speaking"}
              </Text>
              <Text
                numberOfLines={2}
                style={{
                  fontSize: fontSize.bodyLg,
                  color: transcript ? color.ink : color.inkMuted,
                  textAlign: "center",
                  minHeight: 44,
                }}
              >
                {transcript || "Say a product name, e.g. “PVC pipe”"}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel voice search"
                style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}
              >
                <MicOff size={16} color={color.inkMuted} strokeWidth={2} />
                <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.inkMuted }}>
                  Cancel
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Center mic breathing + two staggered rings expanding outward while listening. */
function PulsingMic({ active }: { active: boolean }) {
  const breathe = useRef(new Animated.Value(0)).current;
  const ringA = useRef(new Animated.Value(0)).current;
  const ringB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;

    const loop = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, { toValue: 1, duration: 1400, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );

    breatheLoop.start();
    const ringALoop = loop(ringA, 0);
    const ringBLoop = loop(ringB, 700);
    ringALoop.start();
    ringBLoop.start();

    return () => {
      breatheLoop.stop();
      ringALoop.stop();
      ringBLoop.stop();
      breathe.setValue(0);
      ringA.setValue(0);
      ringB.setValue(0);
    };
  }, [active, breathe, ringA, ringB]);

  const ring = (value: Animated.Value) => ({
    position: "absolute" as const,
    width: 88,
    height: 88,
    borderRadius: circleRadius(88),
    backgroundColor: color.primary,
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
  });

  return (
    <View style={{ width: 88, height: 88, alignItems: "center", justifyContent: "center" }}>
      {active ? <Animated.View style={ring(ringA)} /> : null}
      {active ? <Animated.View style={ring(ringB)} /> : null}
      <Animated.View
        style={{
          width: 72,
          height: 72,
          borderRadius: circleRadius(72),
          backgroundColor: color.primary,
          alignItems: "center",
          justifyContent: "center",
          transform: [
            {
              scale: active
                ? breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] })
                : 1,
            },
          ],
        }}
      >
        <Mic size={30} color={color.onPrimary} strokeWidth={2} />
      </Animated.View>
    </View>
  );
}
