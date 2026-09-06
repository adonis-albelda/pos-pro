import { Redirect, Stack } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { useIdleLock } from "@/lib/idle-lock";
import { PriceInquiryProvider } from "@/lib/price-inquiry";
import { StoreHeader } from "@/components/store-header";
import { PriceInquiryFab } from "@/components/price-inquiry-fab";
import { PriceInquiryModal } from "@/components/price-inquiry-modal";
import { styles } from "@/theme";

export default function PosLayout() {
  const { cashier } = useSession();
  const insets = useSafeAreaInsets();
  const { idleTimeoutMinutes } = useStoreSettings();
  const recordActivity = useIdleLock(idleTimeoutMinutes);

  if (!cashier) return <Redirect href="/unlock" />;

  return (
    <PriceInquiryProvider>
      <View
        style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        onTouchStart={recordActivity}
      >
        <StoreHeader />
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
      </View>
    </PriceInquiryProvider>
  );
}
