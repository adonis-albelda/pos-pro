import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, Easing, Image } from "react-native";
import { Package } from "lucide-react-native";
import { color, radius } from "@/theme";

export interface FlyRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FlyToCartContextValue {
  /** StoreHeader calls this once it knows where its cart chip actually is on screen. Passing null (chip not currently rendered — any POS tab but Sell) makes flyToCart a no-op rather than flying to a stale position. */
  setTarget: (rect: FlyRect | null) => void;
  /** A product tile calls this at the moment it genuinely adds/bumps a cart line — not on every tap (a tap that opens the variant/add-on picker doesn't fly; nothing was added yet). No-op with no target set. */
  flyToCart: (source: FlyRect, photoUrl: string | null) => void;
}

const FlyToCartContext = createContext<FlyToCartContextValue | null>(null);

const FLIGHT_MS = 480;
const CLONE_SIZE = 44;

interface Flight {
  id: number;
  source: FlyRect;
  photoUrl: string | null;
  progress: Animated.Value;
}

/**
 * The "flies to the cart" feedback on an add — mounted once in
 * app/pos/_layout.tsx, above both StoreHeader and the Sell screen, so a
 * flight can cross from anywhere in the grid up to the header's cart chip.
 * Purely decorative: every clone is pointerEvents="none", and nothing here
 * ever touches cart state — that's still only ever the Sell screen's own
 * `lines`.
 */
export function FlyToCartProvider({ children }: { children: ReactNode }) {
  const targetRef = useRef<FlyRect | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const nextId = useRef(0);

  const setTarget = useCallback((rect: FlyRect | null) => {
    targetRef.current = rect;
  }, []);

  const flyToCart = useCallback((source: FlyRect, photoUrl: string | null) => {
    if (!targetRef.current) return;
    const id = nextId.current++;
    const progress = new Animated.Value(0);
    setFlights((current) => [...current, { id, source, photoUrl, progress }]);

    Animated.timing(progress, {
      toValue: 1,
      duration: FLIGHT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setFlights((current) => current.filter((flight) => flight.id !== id));
    });
  }, []);

  const value = useMemo(() => ({ setTarget, flyToCart }), [setTarget, flyToCart]);

  return (
    <FlyToCartContext.Provider value={value}>
      {children}
      {flights.map((flight) => (
        <FlyingClone key={flight.id} flight={flight} target={targetRef.current} />
      ))}
    </FlyToCartContext.Provider>
  );
}

function FlyingClone({ flight, target }: { flight: Flight; target: FlyRect | null }) {
  const { source, photoUrl, progress } = flight;
  // The target this flight actually launched against — captured once, so a
  // second flight starting mid-animation (the cart chip's own layout hasn't
  // moved) can't retarget one already in the air.
  const landingRef = useRef(target);

  if (!landingRef.current) return null;
  const landing = landingRef.current;

  const startX = source.x + source.width / 2 - CLONE_SIZE / 2;
  const startY = source.y + source.height / 2 - CLONE_SIZE / 2;
  const endX = landing.x + landing.width / 2 - CLONE_SIZE / 2;
  const endY = landing.y + landing.height / 2 - CLONE_SIZE / 2;
  // A slight arc, not a straight line — rises partway through before
  // descending into the chip, like a thrown object's path ("like a plane").
  const liftY = Math.min(startY, endY) - 60;

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [startX, endX] });
  const translateY = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [startY, liftY, endY],
  });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });
  const opacity = progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: CLONE_SIZE,
        height: CLONE_SIZE,
        borderRadius: radius.sm,
        overflow: "hidden",
        backgroundColor: photoUrl ? color.surface : color.primary,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: photoUrl ? 1 : 0,
        borderColor: color.border,
        transform: [{ translateX }, { translateY }, { scale }],
        opacity,
        elevation: 30,
        zIndex: 1000,
      }}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : (
        <Package size={20} color={color.onPrimary} strokeWidth={2} />
      )}
    </Animated.View>
  );
}

export function useFlyToCart(): FlyToCartContextValue {
  const ctx = useContext(FlyToCartContext);
  if (!ctx) throw new Error("useFlyToCart must be used inside FlyToCartProvider");
  return ctx;
}
