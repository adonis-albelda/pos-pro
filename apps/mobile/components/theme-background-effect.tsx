import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";
import { useThemePreferences } from "@/lib/theme-preferences";
import { color } from "@/theme";

/**
 * A looping decoration a shop can pick from the Theme menu.
 * `pointerEvents="none"` throughout: this must never steal a tap from the
 * POS above it. "none" (the default) renders nothing. "confetti" also
 * renders nothing here — it isn't a continuous background at all, it's a
 * one-shot burst fired after a sale (see lib/sale-celebration.tsx).
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

  switch (backgroundEffect) {
    case "bubbles":
      return <BubblesEffect />;
    case "rain":
      return <RainEffect />;
    case "snow":
      return (
        <FallingGlyph glyph="❄️" count={26} sizeRange={[14, 26]} durationRange={[7000, 13000]} sway={22} />
      );
    case "leaves":
      return (
        <FallingGlyph
          glyph="🍂"
          count={16}
          sizeRange={[16, 26]}
          durationRange={[5000, 9000]}
          sway={36}
          rotate
        />
      );
    case "petals":
      return (
        <FallingGlyph
          glyph="🌸"
          count={20}
          sizeRange={[14, 22]}
          durationRange={[6000, 11000]}
          sway={30}
          rotate
        />
      );
    case "hearts":
      return <RisingGlyph glyph="❤️" count={18} sizeRange={[14, 24]} durationRange={[5000, 9000]} sway={18} />;
    case "fireflies":
      return <TwinkleField count={20} sizeRange={[4, 8]} durationRange={[1200, 2600]} glow="#E8D96B" drift />;
    case "stars":
      return <TwinkleField count={26} sizeRange={[2, 5]} durationRange={[1400, 3200]} glow="#FFFFFF" />;
    case "sparkles":
      return <TwinkleField count={30} sizeRange={[2, 4]} durationRange={[900, 2000]} glow={color.primary} drift />;
    case "clouds":
      return <CloudsEffect />;
    case "fireworks":
      return <FireworksEffect />;
    default:
      return null;
  }
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

/** One looping progress Animated.Value per element (0 -> 1, then repeats), each on its own randomized duration/delay so the loop never reads as a single synchronized pulse. Direction/meaning of the 0..1 range is entirely up to the caller's own interpolation. */
function useLoop(count: number, durationRange: [number, number]) {
  const { width, height } = useWindowDimensions();
  const items = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: Math.random() * width,
        top: Math.random() * height,
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

/** Each element's own back-and-forth flicker (0 -> 1 -> 0, repeating), all on independent random timing so a group never pulses in unison. */
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

/**
 * A lot of soft circles, all starting below the bottom edge and rising past
 * the top before looping back — genuinely bottom-to-top, not just "somewhere
 * near the top" (an earlier version's start point was a bug: 15% down from
 * the *top*, so it barely rose at all).
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

/** Shared by Snow/Falling Leaves/Petals — a text glyph falling top to bottom with an optional side-to-side sway and rotation. */
function FallingGlyph({
  glyph,
  count,
  sizeRange,
  durationRange,
  sway = 0,
  rotate = false,
}: {
  glyph: string;
  count: number;
  sizeRange: [number, number];
  durationRange: [number, number];
  sway?: number;
  rotate?: boolean;
}) {
  const { items, progress, height } = useLoop(count, durationRange);

  return (
    <View style={STYLES.layer} pointerEvents="none">
      {items.map((item, index) => {
        const value = progress[index];
        if (!value) return null;
        const size = sizeRange[0] + (index % 5) * ((sizeRange[1] - sizeRange[0]) / 4);
        const swayDir = index % 2 === 0 ? 1 : -1;

        return (
          <Animated.Text
            key={index}
            style={{
              position: "absolute",
              left: item.left,
              fontSize: size,
              opacity: value.interpolate({
                inputRange: [0, 0.08, 0.85, 1],
                outputRange: [0, 0.85, 0.6, 0],
              }),
              transform: [
                { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [-size, height + size] }) },
                ...(sway
                  ? [
                      {
                        translateX: value.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, sway * swayDir, 0],
                        }),
                      },
                    ]
                  : []),
                ...(rotate
                  ? [
                      {
                        rotate: value.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0deg", `${360 * swayDir}deg`],
                        }),
                      },
                    ]
                  : []),
              ],
            }}
          >
            {glyph}
          </Animated.Text>
        );
      })}
    </View>
  );
}

/** Shared by Hearts — a text glyph rising bottom to top with a gentle sway, same shape as BubblesEffect but glyph-based. */
function RisingGlyph({
  glyph,
  count,
  sizeRange,
  durationRange,
  sway = 0,
}: {
  glyph: string;
  count: number;
  sizeRange: [number, number];
  durationRange: [number, number];
  sway?: number;
}) {
  const { items, progress, height } = useLoop(count, durationRange);

  return (
    <View style={STYLES.layer} pointerEvents="none">
      {items.map((item, index) => {
        const value = progress[index];
        if (!value) return null;
        const size = sizeRange[0] + (index % 5) * ((sizeRange[1] - sizeRange[0]) / 4);
        const swayDir = index % 2 === 0 ? 1 : -1;
        return (
          <Animated.Text
            key={index}
            style={{
              position: "absolute",
              left: item.left,
              fontSize: size,
              opacity: value.interpolate({
                inputRange: [0, 0.1, 0.85, 1],
                outputRange: [0, 0.8, 0.55, 0],
              }),
              transform: [
                { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [height + size, -size] }) },
                ...(sway
                  ? [
                      {
                        translateX: value.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, sway * swayDir, 0],
                        }),
                      },
                    ]
                  : []),
              ],
            }}
          >
            {glyph}
          </Animated.Text>
        );
      })}
    </View>
  );
}

/**
 * Shared by Fireflies/Stars/Sparkles — small glowing dots at fixed random
 * positions, opacity-pulsing in place (useFlicker) rather than moving across
 * the screen. `drift` adds a very slow, small wander so it doesn't read as
 * perfectly static (fireflies/sparkles); Stars stays still, for a night-sky
 * feel.
 */
function TwinkleField({
  count,
  sizeRange,
  durationRange,
  glow,
  drift = false,
}: {
  count: number;
  sizeRange: [number, number];
  durationRange: [number, number];
  glow: string;
  drift?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const positions = useMemo(
    () => Array.from({ length: count }, () => ({ left: Math.random() * width, top: Math.random() * height })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- randomized once per mount
    [count, width, height],
  );
  const flicker = useFlicker(count, durationRange);
  const wander = useLoop(drift ? count : 0, [4000, 9000]);

  return (
    <View style={STYLES.layer} pointerEvents="none">
      {positions.map((pos, index) => {
        const value = flicker[index];
        if (!value) return null;
        const size = sizeRange[0] + (index % 4) * ((sizeRange[1] - sizeRange[0]) / 3);
        const wanderValue = wander.progress[index];
        const wanderDir = index % 2 === 0 ? 1 : -1;

        return (
          <Animated.View
            key={index}
            style={{
              position: "absolute",
              left: pos.left,
              top: pos.top,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: glow,
              shadowColor: glow,
              shadowOpacity: 0.9,
              shadowRadius: size,
              shadowOffset: { width: 0, height: 0 },
              opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.85] }),
              transform: wanderValue
                ? [
                    {
                      translateX: wanderValue.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 14 * wanderDir, 0],
                      }),
                    },
                    {
                      translateY: wanderValue.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, -10 * wanderDir, 0],
                      }),
                    },
                  ]
                : undefined,
            }}
          />
        );
      })}
    </View>
  );
}

/** A handful of large, low-opacity cloud glyphs drifting slowly left to right across the upper part of the screen. */
function CloudsEffect() {
  const { width } = useWindowDimensions();
  const { items, progress } = useLoop(5, [26000, 42000]);

  return (
    <View style={STYLES.layer} pointerEvents="none">
      {items.map((item, index) => {
        const value = progress[index];
        if (!value) return null;
        const size = 38 + (index % 3) * 18;
        return (
          <Animated.Text
            key={index}
            style={{
              position: "absolute",
              top: item.top * 0.4,
              fontSize: size,
              opacity: 0.35,
              transform: [
                {
                  translateX: value.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-size * 2, width + size * 2],
                  }),
                },
              ],
            }}
          >
            ☁️
          </Animated.Text>
        );
      })}
    </View>
  );
}

const FIREWORK_COLORS = [color.accent, color.primary, "#E8622F", "#4F8EF7", "#E85D9C"];

/** Slots, not particles-per-frame — each slot loops its own wait-then-burst forever at a fixed random point, radiating a handful of colored dots outward and fading. */
function FireworksEffect() {
  const { width, height } = useWindowDimensions();
  const slotCount = 4;
  const particlesPerBurst = 10;

  const slots = useMemo(
    () =>
      Array.from({ length: slotCount }, () => ({
        left: width * 0.15 + Math.random() * width * 0.7,
        top: height * 0.12 + Math.random() * height * 0.35,
        wait: 1200 + Math.random() * 2600,
        color: FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)] ?? color.primary,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- randomized once per mount
    [width, height],
  );
  const burst = useRef(slots.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = burst.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(slots[index]?.wait ?? 2000),
          Animated.timing(value, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [burst, slots]);

  return (
    <View style={STYLES.layer} pointerEvents="none">
      {slots.map((slot, slotIndex) => {
        const value = burst[slotIndex];
        if (!value) return null;
        return Array.from({ length: particlesPerBurst }).map((_, particleIndex) => {
          const angle = (particleIndex / particlesPerBurst) * Math.PI * 2;
          const distance = 46 + (particleIndex % 3) * 14;
          return (
            <Animated.View
              key={`${slotIndex}-${particleIndex}`}
              style={{
                position: "absolute",
                left: slot.left,
                top: slot.top,
                width: 5,
                height: 5,
                borderRadius: 3,
                backgroundColor: slot.color,
                opacity: value.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 0.7, 0] }),
                transform: [
                  {
                    translateX: value.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.cos(angle) * distance],
                    }),
                  },
                  {
                    translateY: value.interpolate({
                      inputRange: [0, 1],
                      // Gravity-ish: drifts down a bit extra by the end, not a perfect circle.
                      outputRange: [0, Math.sin(angle) * distance + 24],
                    }),
                  },
                ],
              }}
            />
          );
        });
      })}
    </View>
  );
}
