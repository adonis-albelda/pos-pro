import { Tabs } from "expo-router";
import { BottomTabBar } from "@/components/bottom-tab-bar";

/**
 * The 4 bottom-nav screens (Sell, Delivery, Sales, Account) as a real Tabs
 * navigator instead of Stack siblings swapped via router.replace(). Stack
 * unmounts whatever screen you navigate away from — for the Sell tab that
 * meant losing `products`/`categories` state and redoing the full SQLite
 * fetch from zero every time a cashier came back from another tab, which is
 * what made switching tabs feel slow (and, worse, left the previous tab's
 * content visible on screen for however long the remount+refetch took).
 * Tabs keeps every tab's screen mounted in the background and just toggles
 * visibility, so returning to a tab is instant — its state is exactly where
 * the cashier left it.
 *
 * `tabBar` renders the existing BottomTabBar unchanged — it already reads
 * its own usePathname()/useRouter() rather than the props this callback
 * receives, same as its other mount site (app/admin/_layout.tsx).
 * `headerShown: false` because StoreHeader/SubPageHeader are handled one
 * level up (app/pos/_layout.tsx), above this whole Tabs group.
 */
export default function PosTabsLayout() {
  return (
    <Tabs
      tabBar={() => <BottomTabBar />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="delivery" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
