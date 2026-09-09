import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";
import { useThemePreferences } from "@/lib/theme-preferences";
import { color } from "@/theme";

/**
 * A looping decoration a shop can pick from the Theme menu.
 * `pointerEvents="none"` throughout: this must never steal a tap from the
 * POS above it. "none" (the default) renders nothing.
 *
 * Mounted from inside app/pos/index.tsx's own tree, not up in a shared
 * layout — expo-router's Stack is a native-stack (react-native-screens)
 * navigator, and each screen it renders is its own native Screen surface, so
 * a plain overlay sitting as a sibling of a <Stack> outside a given screen
 * does not reliably paint above what that screen renders. Only the Sell
 * screen currently mounts this; add it to another screen's own tree the
 * same way if it should show there too.
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

/**
 * A lot of soft circles, all starting below the bottom edge and rising past
 * the top before looping back — genuinely bottom-to-top, not just "somewhere
 * near the top" (the previous version's start point was a bug: 15% down
 * from the *top*, so it barely rose at all).
 */
function BubblesEffect() {
  const { items, progress, height } = useLoop(32, [6000, 12000]);

  return (
    <View style={STYLES.layer} pointerEvents="none">
      {items.map((item, index) => {
        const value = progress[index];
        if (!value) return null;
        const size = 14 + (index % 5) * 8;
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
                inputRange: [0, 0.1, 0.85, 1],
                outputRange: [0, 0.18, 0.12, 0],
              }),
              transform: [
                {
                  // Starts a full bubble-height below the visible area and
                  // rises to a full bubble-height above it — every bubble's
                  // entire rise happens on-screen, edge to edge.
                  translateY: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [height + size, -size],
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
