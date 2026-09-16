import { Redirect, Stack, usePathname } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { useIdleLock } from "@/lib/idle-lock";
import { useLayout } from "@/lib/layout";
import { AccountDrawerProvider } from "@/lib/account-drawer";
import { CartSummaryProvider } from "@/lib/cart-summary";
import { DraftSummaryProvider } from "@/lib/draft-summary";
import { FlyToCartProvider } from "@/lib/fly-to-cart";
import { PriceInquiryProvider } from "@/lib/price-inquiry";
import { StoreHeader } from "@/components/store-header";
import { SubPageHeader } from "@/components/sub-page-header";
import { PriceInquiryModal } from "@/components/price-inquiry-modal";
import { PinRelockOverlay } from "@/components/pin-relock-overlay";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { styles } from "@/theme";

/** Drawer-reached detail screens — plain back-arrow + title chrome (SubPageHeader) instead of the full StoreHeader. Kept in sync with AccountDrawer's POS_TABS/HELP_TABS hrefs and its standalone "Help Center" DrawerTab. */
const DRAWER_SUBPAGE_TITLES: Record<string, string> = {
  "/pos/theme": "Theme",
  "/pos/settings": "Settings",
  "/pos/sync": "Sync",
  "/pos/faq": "FAQ",
  "/pos/about": "About",
  "/pos/help-center": "Help Center",
};

/** Same screens as above, keyed by their Stack route name (file basename) instead of full path — pushed from the drawer, so they get a real slide-in instead of the tab-swap fade below. */
const DRAWER_SUBPAGE_ROUTE_NAMES = new Set(["theme", "settings", "sync", "faq", "about", "help-center"]);

export default function PosLayout() {
  const { cashier } = useSession();
  const insets = useSafeAreaInsets();
  const { idleTimeoutMinutes: storeIdleTimeoutMinutes } = useStoreSettings();
  // Self-service override (Account tab, Settings) wins when set — null falls
  // back to the branch default, same as every other per-user preference.
  const recordActivity = useIdleLock(cashier?.idleTimeoutMinutes ?? storeIdleTimeoutMinutes);
  const { compact } = useLayout();
  const pathname = usePathname();

  // Tablet Sell owns StoreHeader inside its left column so the cart can sit
  // full-height beside header+grid. Other tabs (and phone) keep the chrome here.
  const sellOwnsHeader = !compact && pathname === "/pos";
  const subPageTitle = DRAWER_SUBPAGE_TITLES[pathname];
  // A drawer sub-page is a dead end reached to go do one thing, not a tab to
  // jump out of mid-task — SubPageHeader's back arrow is the only way out.
  // Shown at every width/orientation now, not just phone — a tablet held
  // sideways still benefits from one-tap Sell/Delivery/History/Attendance.
  const showBottomTabBar = !subPageTitle;

  if (!cashier) return <Redirect href="/unlock" />;

  return (
    <AccountDrawerProvider>
      <CartSummaryProvider>
      <DraftSummaryProvider>
        {/* Above StoreHeader and the Stack alike — a flight launches from a
            tile deep inside the Sell screen and lands on the header's cart
            chip, two different subtrees it has to render over both of. */}
        <FlyToCartProvider>
          <PriceInquiryProvider>
            <View
              style={[
                styles.screen,
                { paddingTop: insets.top, paddingBottom: showBottomTabBar ? 0 : insets.bottom },
              ]}
              onTouchStart={recordActivity}
            >
              {subPageTitle ? (
                <SubPageHeader title={subPageTitle} />
              ) : sellOwnsHeader ? null : (
                <StoreHeader />
              )}
              <View style={{ flex: 1, minHeight: 0 }}>
                <Stack
                  screenOptions={({ route }) => ({
                    headerShown: false,
                    contentStyle: { backgroundColor: "transparent" },
                    ...(DRAWER_SUBPAGE_ROUTE_NAMES.has(route.name)
                      ? // Pushed from the drawer, not swapped between like the
                        // tabs below — a real slide-in reads as "opened a
                        // screen", matching SubPageHeader's back arrow.
                        { animation: "slide_from_right", animationDuration: 220 }
                      : // These routes are lateral tabs reached with router.replace(),
                        // not a hierarchy — a push/pop slide has no clean "replace"
                        // animation and is what reads as one screen mixing into the
                        // other. A fade is direction-less and correct for swapping
                        // siblings.
                        { animation: "fade", animationDuration: 180 }),
                  })}
                />
              </View>
              <PriceInquiryModal />
              <PinRelockOverlay />
              {showBottomTabBar ? <BottomTabBar /> : null}
            </View>
          </PriceInquiryProvider>
        </FlyToCartProvider>
      </DraftSummaryProvider>
      </CartSummaryProvider>
    </AccountDrawerProvider>
  );
}
