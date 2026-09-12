import { useRef, useState } from "react";
import { Animated, Dimensions, PanResponder, View } from "react-native";
import { Tag } from "lucide-react-native";
import { usePriceInquiry } from "@/lib/price-inquiry";
import { circleRadius, color, space } from "@/theme";

const FAB_SIZE = 56;
const FAB_MARGIN = space.lg;
/** Below this, a gesture reads as a tap rather than a drag. */
const DRAG_THRESHOLD = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function defaultPosition(): { x: number; y: number } {
  const { width, height } = Dimensions.get("window");
  return { x: width - FAB_SIZE - FAB_MARGIN, y: height - FAB_SIZE - FAB_MARGIN * 3 };
}

/**
 * Draggable, reachable from every POS screen (mounted once in
 * app/pos/_layout.tsx) — same idea as admin's price-inquiry-fab.tsx, PanResponder
 * instead of pointer events since this is React Native. Position resets to
 * the default corner on cold start rather than persisting across launches —
 * see the plan's reasoning (a relaunch is already a natural, low-friction
 * reset point). Renders nothing when the terminal has chosen the menu style
 * instead (see the account drawer's "Price inquiry" entry).
 */
export function PriceInquiryFab() {
  const { style, open } = usePriceInquiry();
  const [position, setPosition] = useState(defaultPosition);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = position;
        moved.current = false;
      },
      onPanResponderMove: (_event, gesture) => {
        if (!dragStart.current) return;
        if (Math.abs(gesture.dx) > DRAG_THRESHOLD || Math.abs(gesture.dy) > DRAG_THRESHOLD) {
          moved.current = true;
        }
        const { width, height } = Dimensions.get("window");
        setPosition({
          x: clamp(dragStart.current.x + gesture.dx, 0, width - FAB_SIZE),
          y: clamp(dragStart.current.y + gesture.dy, 0, height - FAB_SIZE),
        });
      },
      onPanResponderRelease: () => {
        dragStart.current = null;
        if (!moved.current) open();
      },
    }),
  ).current;

  if (style !== "floating") return null;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: circleRadius(FAB_SIZE),
        zIndex: 50,
        elevation: 8,
      }}
    >
      <View
        style={{
          width: "100%",
          height: "100%",
          borderRadius: circleRadius(FAB_SIZE),
          backgroundColor: color.primary,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: color.ink,
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
        }}
      >
        <Tag size={24} color="#FFFFFF" strokeWidth={2} />
      </View>
    </Animated.View>
  );
}
