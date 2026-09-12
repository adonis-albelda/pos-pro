import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import { COMPANY_INTRO_HOLD_MS, COMPANY_PRODUCT } from "@double-a/ui";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, space } from "@/theme";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- same asset-require pattern as elsewhere; no *.gif module declaration in this project
const SPLASH_LOGO = require("../assets/splash-loop.webp");
// Source is 1146x379 — a wide lockup, not a square mark, so it's sized by
// that ratio instead of forced into a square box like the old static logo.
const SPLASH_LOGO_WIDTH = 240;
const SPLASH_LOGO_HEIGHT = Math.round((SPLASH_LOGO_WIDTH * 379) / 1146);

/**
 * Cold-start splash: mark, product line, powered-by credit. Tap skips.
 * No rotating slogans — one calm composition.
 */
export function CompanyIntro({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const finished = useRef(false);
  const [ready, setReady] = useState(false);

  function finish() {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 8,
        tension: 55,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => setReady(true));
  }, [logoScale, opacity, translateY]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(finish, COMPANY_INTRO_HOLD_MS);
    return () => clearTimeout(timer);
    // finish closes over onDone once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <Pressable
      onPress={finish}
      accessibilityRole="button"
      accessibilityLabel="Continue"
      style={{
        flex: 1,
        backgroundColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space.xl,
      }}
    >
      <WaveBackdrop />

      {/* Floating card — same treatment as setup/unlock: white, rounded, shadow over the wave. */}
      <Animated.View
        style={{
          alignItems: "center",
          maxWidth: 340,
          width: "100%",
          backgroundColor: color.surface,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: color.borderSoft,
          paddingVertical: space["2xl"],
          paddingHorizontal: space.xl,
          shadowColor: "#000",
          shadowOpacity: 0.14,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 10,
          opacity,
          transform: [{ translateY }, { scale: logoScale }],
        }}
      >
        <Image
          source={SPLASH_LOGO}
          style={{ width: SPLASH_LOGO_WIDTH, height: SPLASH_LOGO_HEIGHT }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <View
          style={{
            marginTop: space.md,
            width: 40,
            height: 2,
            borderRadius: 1,
            backgroundColor: color.primary,
          }}
        />

        <Text
          style={{
            marginTop: space.md,
            fontSize: fontSize.caption,
            fontWeight: "600",
            letterSpacing: 1.2,
            color: color.inkMuted,
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          {COMPANY_PRODUCT}
        </Text>
      </Animated.View>

      {/* Sits on the green wave, not the old light sage — needs light text, not primaryDark. */}
      <Text
        style={{
          position: "absolute",
          bottom: space["3xl"],
          fontSize: fontSize.caption,
          fontWeight: "600",
          color: color.sageLight,
          letterSpacing: 0.3,
          opacity: 0.85,
        }}
      >
        Tap to continue
      </Text>
    </Pressable>
  );
}
