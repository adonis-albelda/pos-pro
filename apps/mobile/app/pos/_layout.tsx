import { Redirect, Stack, usePathname } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { useIdleLock } from "@/lib/idle-lock";
import { useLayout } from "@/lib/layout";
import { CartSummaryProvider } from "@/lib/cart-summary";
import { FlyToCartProvider } from "@/lib/fly-to-cart";
import { PriceInquiryProvider } from "@/lib/price-inquiry";
import { StoreHeader } from "@/components/store-header";
import { PriceInquiryFab } from "@/components/price-inquiry-fab";
import { PriceInquiryModal } from "@/components/price-inquiry-modal";
import { PinRelockOverlay } from "@/components/pin-relock-overlay";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { styles } from "@/theme";

export default function PosLayout() {
  const { cashier } = useSession();
  const insets = useSafeAreaInsets();
  const { idleTimeoutMinutes } = useStoreSettings();
  const recordActivity = useIdleLock(idleTimeoutMinutes);
  const { compact } = useLayout();
  const pathname = usePathname();

  // Tablet Sell owns StoreHeader inside its left column so the cart can sit
  // full-height beside header+grid. Other tabs (and phone) keep the chrome here.
  const sellOwnsHeader = !compact && pathname === "/pos";

  if (!cashier) return <Redirect href="/unlock" />;

  return (
    <CartSummaryProvider>
      {/* Above StoreHeader and the Stack alike — a flight launches from a
          tile deep inside the Sell screen and lands on the header's cart
          chip, two different subtrees it has to render over both of. */}
      <FlyToCartProvider>
        <PriceInquiryProvider>
          <View
            style={[
              styles.screen,
              { paddingTop: insets.top, paddingBottom: compact ? 0 : insets.bottom },
            ]}
            onTouchStart={recordActivity}
          >
            {sellOwnsHeader ? null : <StoreHeader />}
            <View style={{ flex: 1, minHeight: 0 }}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "transparent" },
                  // These routes are lateral tabs reached with router.replace(), not a
                  // hierarchy — a push/pop slide has no clean "replace" animation and
                  // is what reads as one screen mixing into the other. A fade is
                  // direction-less and correct for swapping siblings.
                  animation: "fade",
                  animationDuration: 180,
                }}
              />
            </View>
            <PriceInquiryFab />
            <PriceInquiryModal />
            <PinRelockOverlay />
            {compact ? <BottomTabBar /> : null}
          </View>
        </PriceInquiryProvider>
      </FlyToCartProvider>
    </CartSummaryProvider>
  );
}
