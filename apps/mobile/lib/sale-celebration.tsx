import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";
import { color } from "@/theme";

const CONFETTI_COLORS = [color.primary, color.accent, "#E8622F", "#4F8EF7", "#E85D9C", "#3FA34D"];
const PIECE_COUNT = 60;
const BURST_MS = 2200;

interface Burst {
  id: number;
  progress: Animated.Value;
}

/**
 * The "confetti" background option (lib/theme-preferences.ts) isn't a
 * continuous decoration like the rest — it's a one-shot burst fired after a
 * successful sale. A plain hook, not a Context/Provider like fly-to-cart: the
 * only place that triggers it (finishSale, app/pos/index.tsx) and the only
 * place that needs to render it are the same screen, so there is nothing to
 * share across components here.
 *
 * The caller decides *whether* to call `celebrate()` (gate it on
 * `backgroundEffect === "confetti"`) and must render `node` somewhere in its
 * own tree, same spot as `<ThemeBackgroundEffect />`.
 */
export function useSaleCelebration(): { celebrate: () => void; node: React.ReactNode } {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const nextId = useRef(0);

  const celebrate = useCallback(() => {
    const id = nextId.current++;
    const progress = new Animated.Value(0);
    setBursts((current) => [...current, { id, progress }]);

    Animated.timing(progress, {
      toValue: 1,
      duration: BURST_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setBursts((current) => current.filter((burst) => burst.id !== id));
    });
  }, []);

  const node = (
    <>
      {bursts.map((burst) => (
        <ConfettiBurst key={burst.id} progress={burst.progress} />
      ))}
    </>
  );

  return { celebrate, node };
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

function ConfettiBurst({ progress }: { progress: Animated.Value }) {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, () => ({
        left: Math.random() * width,
        // Fraction of the burst's own duration before this piece starts
        // falling — staggers the whole burst off one shared progress value
        // instead of needing PIECE_COUNT separate Animated.timings.
        start: Math.random() * 0.3,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] ?? color.primary,
        width: 6 + Math.random() * 5,
        height: 10 + Math.random() * 6,
        swing: (Math.random() - 0.5) * 90,
        spin: (Math.random() > 0.5 ? 1 : -1) * (320 + Math.random() * 360),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- randomized once per burst
    [width],
  );

  return (
    <View style={STYLES.layer} pointerEvents="none">
      {pieces.map((piece, index) => (
        <Animated.View
          key={index}
          style={{
            position: "absolute",
            left: piece.left,
            top: 0,
            width: piece.width,
            height: piece.height,
            borderRadius: 1,
            backgroundColor: piece.color,
            opacity: progress.interpolate({
              inputRange: [0, piece.start, 0.85, 1],
              outputRange: [0, 1, 1, 0],
              extrapolate: "clamp",
            }),
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, piece.start, 1],
                  outputRange: [-20, -20, height + 20],
                  extrapolate: "clamp",
                }),
              },
              {
                translateX: progress.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, piece.swing, 0],
                }),
              },
              {
                rotate: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", `${piece.spin}deg`],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}
