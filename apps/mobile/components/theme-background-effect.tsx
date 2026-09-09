import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";
import { useThemePreferences } from "@/lib/theme-preferences";
import { color } from "@/theme";

/**
 * Sits behind every screen (see app/_layout.tsx, mounted next to
 * PaperBackdrop) — subtle, low-opacity, looping decoration a shop can pick
 * from the Theme menu. `pointerEvents="none"` throughout: this must never
 * steal a tap from the POS above it. "none" (the default) renders nothing.
 */
export function ThemeBackgroundEffect() {
  const { backgroundEffect } = useThemePreferences();

  if (backgroundEffect === "bubbles") return <BubblesEffect />;
  if (backgroundEffect === "rain") return <RainEffect />;
  if (backgroundEffect === "fire") return <FireEffect />;
  return null;
}

const STYLES = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
});

/** One looping rise-and-fade Animated.Value per element, each on its own randomized duration/delay so the loop never reads as a single synchronized pulse. */
function useLoop(count: number, durationRange: [number, number]) {
  const { width, height } = useWindowDimensions();
  const items = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: Math.random() * width,
        size: 0,
        duration: durationRange[0] + Math.random() * (durationRange[1] - durationRange[0]),
        delay: Math.random() * durationRange[1],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- randomized once per mount; a window resize is not worth re-scattering every element
    [count, width, height],
  );
  const progress = useRef(items.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = progress.map((value, index) =>
      Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration: items[index]?.duration ?? 6000,
          delay: items[index]?.delay ?? 0,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [items, progress]);

  return { items, progress, width, height };
}

/** Soft circles drifting up from the bottom, fading out near the top. */
function BubblesEffect() {
  const { items, progress, height } = useLoop(10, [7000, 13000]);

  return (
    <View style={STYLES.layer} pointerEvents="none">
      {items.map((item, index) => {
        const value = progress[index];
        if (!value) return null;
        const size = 18 + (index % 4) * 10;
        return (
          <Animated.View
            key={index}
            style={{
              position: "absolute",
              left: item.left,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color.primary,
              opacity: value.interpolate({
                inputRange: [0, 0.15, 0.85, 1],
                outputRange: [0, 0.16, 0.1, 0],
              }),
              transform: [
                {
                  translateY: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [height * 0.15, -height * 0.25],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

/** Thin diagonal streaks falling top to bottom. */
function RainEffect() {
  const { items, progress, height } = useLoop(16, [900, 1600]);

  return (
    <View style={STYLES.layer} pointerEvents="none">
      {items.map((item, index) => {
        const value = progress[index];
        if (!value) return null;
        return (
          <Animated.View
            key={index}
            style={{
              position: "absolute",
              left: item.left,
              top: -40,
              width: 2,
              height: 22,
              borderRadius: 1,
              backgroundColor: color.inkMuted,
              opacity: 0.14,
              transform: [
                { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, height + 60] }) },
                { rotate: "12deg" },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

/** A warm glow along the bottom edge with a slow flicker — never actual flame shapes, just enough motion to read as "fire" without being distracting on a shop-floor screen. */
function FireEffect() {
  const flicker = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [flicker]);

  return (
    <View style={STYLES.layer} pointerEvents="none">
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 140,
          backgroundColor: "#E8622F",
          opacity: flicker.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.14] }),
        }}
      />
    </View>
  );
}
