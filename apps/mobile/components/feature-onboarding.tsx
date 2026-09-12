import { useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Button } from "@/components/ui";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { markFeatureOnboardingSeen } from "@/lib/onboarding";
import { color, fontSize, space } from "@/theme";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- asset-require pattern; no *.png module declaration
const ILLUSTRATIONS = [
  require("../assets/onboarding/sell-faster.png"),
  require("../assets/onboarding/know-inventory.png"),
  require("../assets/onboarding/manage-business.png"),
  require("../assets/onboarding/understand-numbers.png"),
] as const;

type Step = {
  image: (typeof ILLUSTRATIONS)[number];
  title: string;
  subtitle: string;
  body: string;
};

const STEPS: Step[] = [
  {
    image: ILLUSTRATIONS[0],
    title: "Sell Faster",
    subtitle: "A simple and powerful POS built for fast transactions.",
    body: "Process sales quickly with an intuitive checkout, multiple payment methods, product variants, discounts, and a smooth cashier experience.",
  },
  {
    image: ILLUSTRATIONS[1],
    title: "Know Your Inventory",
    subtitle: "Stay in control of your stock across every location.",
    body: "Track inventory by product and variant, manage stock transfers, receive purchases, and keep your stock levels accurate.",
  },
  {
    image: ILLUSTRATIONS[2],
    title: "Manage Your Business",
    subtitle: "Everything you need to keep your business running.",
    body: "Manage employees, terminals, expenses, customers, suppliers, purchase orders, and daily operations from one place.",
  },
  {
    image: ILLUSTRATIONS[3],
    title: "Understand Your Numbers",
    subtitle: "See where your money comes from and where it goes.",
    body: "Track sales, expenses, cash flow, and cash movements so you always have a clearer picture of your business.",
  },
];

/**
 * First-install feature steppers. Shown once after the company splash, before
 * setup/unlock. Next / Back move between slides; last step finishes and
 * marks the flag so cold starts skip this forever after.
 */
export function FeatureOnboarding({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const step = STEPS[index]!;
  const isFirst = index === 0;
  const isLast = index === STEPS.length - 1;

  function animateTo(nextIndex: number, direction: 1 | -1) {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: direction * -24,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIndex(nextIndex);
      translateX.setValue(direction * 24);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }

  function goBack() {
    if (isFirst) return;
    animateTo(index - 1, -1);
  }

  function goNext() {
    if (isLast) {
      void finish();
      return;
    }
    animateTo(index + 1, 1);
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      await markFeatureOnboardingSeen();
    } finally {
      onDone();
    }
  }

  const cardMaxWidth = Math.min(420, width - space.xl * 2);
  // Tall portrait art — cap so card + buttons still fit short phones.
  const artHeight = Math.min(220, Math.round(height * 0.28));

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "transparent",
        paddingTop: insets.top + space.lg,
        paddingBottom: insets.bottom + space.lg,
        paddingHorizontal: space.xl,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <WaveBackdrop />

      <Animated.View
        style={{
          width: "100%",
          maxWidth: cardMaxWidth,
          backgroundColor: color.surface,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: color.borderSoft,
          paddingTop: space.xl,
          paddingBottom: space.lg,
          paddingHorizontal: space.lg,
          shadowColor: "#000",
          shadowOpacity: 0.14,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 10,
          opacity,
          transform: [{ translateX }],
        }}
      >
        <Image
          source={step.image}
          style={{
            alignSelf: "center",
            width: "100%",
            height: artHeight,
          }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        <Text
          style={{
            marginTop: space.md,
            fontSize: fontSize.headingMd,
            fontWeight: "700",
            color: color.ink,
            textAlign: "center",
          }}
        >
          {step.title}
        </Text>
        <Text
          style={{
            marginTop: space.sm,
            fontSize: fontSize.bodyLg,
            fontWeight: "600",
            color: color.primary,
            textAlign: "center",
            lineHeight: 22,
          }}
        >
          {step.subtitle}
        </Text>
        <Text
          style={{
            marginTop: space.md,
            fontSize: fontSize.body,
            color: color.inkMuted,
            textAlign: "center",
            lineHeight: 22,
          }}
        >
          {step.body}
        </Text>

        <View
          style={{
            marginTop: space.lg,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: space.sm,
          }}
        >
          {STEPS.map((_, i) => (
            <View
              key={STEPS[i]!.title}
              style={{
                width: i === index ? 22 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === index ? color.primary : color.border,
              }}
            />
          ))}
        </View>

        <View
          style={{
            marginTop: space.lg,
            flexDirection: "row",
            gap: space.sm,
          }}
        >
          <Button
            label="Back"
            variant="secondary"
            icon={ChevronLeft}
            disabled={isFirst || busy}
            onPress={goBack}
            style={{ flex: 1 }}
          />
          <Button
            label={isLast ? "Get started" : "Next"}
            variant="primary"
            icon={isLast ? undefined : ChevronRight}
            busy={busy}
            onPress={goNext}
            style={{ flex: 1.4 }}
          />
        </View>

        {!isLast ? (
          <Pressable
            onPress={() => void finish()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Skip introduction"
            style={{
              marginTop: space.md,
              alignSelf: "center",
              paddingVertical: space.sm,
              paddingHorizontal: space.md,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                fontSize: fontSize.caption,
                fontWeight: "600",
                color: color.inkMuted,
                letterSpacing: 0.3,
              }}
            >
              Skip
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}
