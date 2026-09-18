import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { color, radius, space, styles } from "@/theme";

const SKELETON_ROWS = 4;

/**
 * Placeholder grid shown while the first page of products is still loading
 * (see app/pos/index.tsx's `!ready || (loadingPage && products.length === 0)`
 * branch) — same row/column shape as the real FlatList grid (flex:1 tiles
 * in `columns`-wide rows), so the swap to real tiles doesn't jump the layout.
 */
export function ProductGridSkeleton({
  columns,
  gap,
  tileMinHeight = 140,
}: {
  columns: number;
  gap: number;
  tileMinHeight?: number;
}) {
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={{ flex: 1, paddingHorizontal: gap / 2, gap }}>
      {Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: "row", gap }}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Animated.View
              key={colIndex}
              style={[
                styles.card,
                animatedStyle,
                {
                  flex: 1,
                  minHeight: tileMinHeight,
                  padding: space.md,
                  gap: space.sm,
                  justifyContent: "flex-end",
                },
              ]}
            >
              <View style={{ flex: 1, borderRadius: radius.sm, backgroundColor: color.border }} />
              <View style={{ height: 12, width: "70%", borderRadius: 4, backgroundColor: color.border }} />
              <View style={{ height: 12, width: "40%", borderRadius: 4, backgroundColor: color.border }} />
            </Animated.View>
          ))}
        </View>
      ))}
    </View>
  );
}
