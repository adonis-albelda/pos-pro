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

/** Each flame's own back-and-forth flicker, all on independent random timing so a row of flames never breathes in unison. */
function useFlicker(count: number, durationRange: [number, number]) {
  const values = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
  const timing = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        duration: durationRange[0] + Math.random() * (durationRange[1] - durationRange[0]),
        delay: Math.random() * durationRange[1],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- randomized once per mount
    [count],
  );

  useEffect(() => {
    const loops = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: timing[index]?.duration ?? 900,
            delay: timing[index]?.delay ?? 0,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: timing[index]?.duration ?? 900,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [values, timing]);

  return values;
}

const FLAME_COLORS = {
  base: "#D9481F",
  mid: "#F2994A",
  tip: "#FBD97A",
};

/**
 * A row of flame shapes (three stacked, tapering blobs each — base/mid/tip,
 * the cheap-but-recognizable way to fake a flame silhouette without an SVG
 * or gradient library) plus embers drifting up out of them. The previous
 * version was a flat, flickering rectangle — no flame shape at all, which
 * is why it didn't read as fire.
 */
function FireEffect() {
  const { width } = useWindowDimensions();
  const flameCount = Math.max(5, Math.round(width / 70));
  const flicker = useFlicker(flameCount, [700, 1300]);
  const { items: embers, progress: emberProgress } = useLoop(18, [1400, 2400]);

  return (
    <View style={STYLES.layer} pointerEvents="none">
      {/* Base glow — grounds the flames in a warm wash instead of them
          floating on bare background. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 60,
          backgroundColor: FLAME_COLORS.base,
          opacity: 0.12,
        }}
      />

      {Array.from({ length: flameCount }).map((_, index) => {
        const value = flicker[index];
        if (!value) return null;
        const left = (width / flameCount) * index + (width / flameCount) * 0.5 * ((index % 2) - 0.5);
        const flameWidth = 34 + (index % 3) * 10;
        const flameHeight = 70 + (index % 4) * 18;

        return (
          <Animated.View
            key={index}
            style={{
              position: "absolute",
              left,
              bottom: 0,
              width: flameWidth,
              height: flameHeight,
              alignItems: "center",
              justifyContent: "flex-end",
              transform: [
                { scaleY: value.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) },
                { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] }) },
              ],
            }}
          >
            {/* base */}
            <View
              style={{
                position: "absolute",
                bottom: 0,
                width: flameWidth,
                height: flameWidth * 1.5,
                borderRadius: flameWidth,
                backgroundColor: FLAME_COLORS.base,
                opacity: 0.5,
              }}
            />
            {/* mid */}
            <View
              style={{
                position: "absolute",
                bottom: flameWidth * 0.55,
                width: flameWidth * 0.68,
                height: flameWidth * 1.15,
                borderRadius: flameWidth,
                backgroundColor: FLAME_COLORS.mid,
                opacity: 0.55,
              }}
            />
            {/* tip */}
            <View
              style={{
                position: "absolute",
                bottom: flameWidth * 1.15,
                width: flameWidth * 0.34,
                height: flameWidth * 0.62,
                borderRadius: flameWidth,
                backgroundColor: FLAME_COLORS.tip,
                opacity: 0.6,
              }}
            />
          </Animated.View>
        );
      })}

      {/* Embers — small sparks drifting up out of the flames and fading, a
          short rise (not edge-to-edge like Bubbles), same useLoop rise
          mechanics reused with fire's own timing/colors. */}
      {embers.map((item, index) => {
        const value = emberProgress[index];
        if (!value) return null;
        const size = 3 + (index % 3) * 2;
        const rise = 160 + (index % 5) * 30;
        return (
          <Animated.View
            key={index}
            style={{
              position: "absolute",
              left: item.left,
              bottom: 0,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: index % 2 === 0 ? FLAME_COLORS.tip : FLAME_COLORS.mid,
              opacity: value.interpolate({
                inputRange: [0, 0.15, 0.8, 1],
                outputRange: [0, 0.7, 0.4, 0],
              }),
              transform: [
                {
                  translateY: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -rise],
                  }),
                },
                {
                  translateX: value.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, index % 2 === 0 ? 10 : -10, 0],
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
