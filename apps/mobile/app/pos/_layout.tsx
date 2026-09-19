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

/** Same screens as above, keyed by their Stack route name (file basename) instead of full path — pushed from the drawer, so they get a real slide-in instead of the instant swap the (tabs) group below uses for its own 4 screens. */
const DRAWER_SUBPAGE_ROUTE_NAMES = new Set(["theme", "settings", "sync", "faq", "about", "help-center"]);

/** Also a real push (a sale row, tapped from Sales/Delivery), not a lateral tab — same slide as the drawer sub-pages above, not the (tabs) group's fade. */
const PUSHED_ROUTE_NAMES = new Set([...DRAWER_SUBPAGE_ROUTE_NAMES, "sale/[id]"]);

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
  // The (tabs) group's own BottomTabBar (app/pos/(tabs)/_layout.tsx) is what
  // actually disappears on a sub-page — that group unmounts (Stack push),
  // taking its tab bar with it; this flag just mirrors that for this
  // wrapper's own bottom inset padding.
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
                <StoreHeader pathname={pathname} />
              )}
              <View style={{ flex: 1, minHeight: 0 }}>
                <Stack
                  screenOptions={({ route }) => ({
                    headerShown: false,
                    contentStyle: { backgroundColor: "transparent" },
                    ...(PUSHED_ROUTE_NAMES.has(route.name)
                      ? // Pushed from the drawer, or a sale row tapped from
                        // Sales/Delivery — not swapped between like the tabs
                        // below. slide_from_right on the way in; back
                        // (button or gesture) automatically reverses it to
                        // slide back out to the right, no separate config.
                        { animation: "slide_from_right", animationDuration: 220 }
                      : // Just the (tabs) group itself here — switching among its
                        // 4 screens happens inside its own Tabs navigator
                        // (app/pos/(tabs)/_layout.tsx) and never reaches this
                        // Stack at all. This fade only plays when this Stack
                        // itself transitions the (tabs) group in/out, e.g.
                        // returning here from a drawer sub-page.
                        { animation: "fade", animationDuration: 180 }),
                  })}
                />
              </View>
              <PriceInquiryModal />
              <PinRelockOverlay />
            </View>
          </PriceInquiryProvider>
        </FlyToCartProvider>
      </DraftSummaryProvider>
      </CartSummaryProvider>
    </AccountDrawerProvider>
  );
}
