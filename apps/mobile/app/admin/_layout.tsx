import { useEffect, useState, type ReactNode } from "react";
import { Redirect, Stack, usePathname, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ROLES } from "@double-a/shared-types";
import { useLocationScope } from "@/lib/location-scope";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { useIdleLock } from "@/lib/idle-lock";
import { ensureFreshSession } from "@/lib/api/session";
import { AccountDrawerProvider } from "@/lib/account-drawer";
import { CartSummaryProvider } from "@/lib/cart-summary";
import { FlyToCartProvider } from "@/lib/fly-to-cart";
import { Button } from "@/components/ui";
import { LoadingState } from "@/components/loading-state";
import { PinRelockOverlay } from "@/components/pin-relock-overlay";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { StoreHeader } from "@/components/store-header";
import { space, styles } from "@/theme";

type SessionCheck = "checking" | "ready" | "error";

/**
 * Admin mode: web dashboard in a WebView at /admin (default), with native
 * screens kept aside under /admin/native and /admin/*. Online-only — same as
 * apps/admin (CLAUDE.md §5). Same chrome as the POS tabs (StoreHeader +
 * BottomTabBar, see app/pos/_layout.tsx) — Admin is just another tab, not a
 * separate app-within-an-app, so it carries its own CartSummary/FlyToCart
 * providers only because StoreHeader needs them, not because either does
 * anything here (no cart on this tab; the chip stays hidden off /pos).
 */
export default function AdminLayout() {
  const { cashier } = useSession();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { idleTimeoutMinutes } = useStoreSettings();
  // Same idle/background lock as the POS tabs (lib/idle-lock.ts) — the admin
  // dashboard is reached from the same shift and must not stay unlocked here
  // just because the cashier tapped away from the Sell screen first.
  const recordActivity = useIdleLock(idleTimeoutMinutes);
  // "Account used to login is admin" (device.ts EnrolledRole) also opens the
  // dashboard, regardless of which PIN shift user is on — same rule as
  // account-drawer.tsx's ADMIN_TAB gate, kept in sync with it.
  const { role: enrolledRole } = useLocationScope();

  const [check, setCheck] = useState<SessionCheck>("checking");
  const [error, setError] = useState<string | null>(null);
  const canOpenAdminDashboard =
    enrolledRole === ROLES.ADMIN || cashier?.role === ROLES.ADMIN || cashier?.role === ROLES.MANAGER;

  // Unlocking a shift only proves the cashier's PIN was good at that moment —
  // it says nothing about whether the terminal's own stored API token is
  // still accepted. Every screen under here calls getApiClient() directly
  // with no check of its own, so without this gate a stale token surfaces as
  // every domain (categories, suppliers, products, all of it) failing at
  // once with an unclear error, instead of one clear message here.
  useEffect(() => {
    if (!cashier || !canOpenAdminDashboard) return;
    let cancelled = false;
    ensureFreshSession()
      .then(() => {
        if (!cancelled) setCheck("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Could not reach the server.");
        setCheck("error");
      });
    return () => {
      cancelled = true;
    };
  }, [cashier, canOpenAdminDashboard]);

  if (!cashier) return <Redirect href="/unlock" />;
  // Manager/admin shift user gets the dashboard; so does any shift user on a
  // device enrolled under an admin login (item 5). Everyone else (cashier,
  // driver, helper) on a plain terminal never reaches here.
  if (!canOpenAdminDashboard) return <Redirect href="/pos" />;

  // The embedded web dashboard is a dead end to go look at, not a tab to
  // jump out of mid-task — same reasoning as the drawer's own detail screens
  // (see app/pos/_layout.tsx's showBottomTabBar). Native admin subpages
  // (/admin/native/...) keep the bar. Shown at every width/orientation now,
  // not just phone — same reasoning as pos/_layout.tsx's own change.
  const showBottomTabBar = pathname !== "/admin";

  // StoreHeader stays mounted through "checking"/"error" too — it used to be
  // swapped out for a bare LoadingState/error screen, which made the header
  // flash away and back on every open instead of just showing its own state
  // underneath a chrome that never moves.
  let content: ReactNode;
  if (check === "checking") {
    content = <LoadingState text="Opening Backoffice…" />;
  } else if (check === "error") {
    content = (
      <View
        style={[
          styles.screen,
          { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md },
        ]}
      >
        <Text style={styles.subheading}>Could not open Backoffice</Text>
        <Text style={[styles.muted, { textAlign: "center" }]}>{error}</Text>
        <Button label="Back to POS" onPress={() => router.replace("/pos")} />
      </View>
    );
  } else {
    content = (
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    );
  }

  return (
    <AccountDrawerProvider>
      <CartSummaryProvider>
        <FlyToCartProvider>
          <View
            style={[
              styles.screen,
              { paddingTop: insets.top, paddingBottom: showBottomTabBar ? 0 : insets.bottom },
            ]}
            // Catches taps on any native (non-WebView) screen under here. A tap
            // inside the WebView itself (app/admin/index.tsx) does not bubble to
            // RN's touch responder system, so it can't reset this clock —
            // background/foreground locking (AppState, see lib/idle-lock.ts)
            // still fires regardless and is the part that matters most for
            // "walked away with the dashboard open."
            onTouchStart={recordActivity}
          >
            <StoreHeader />

            <View style={{ flex: 1, minHeight: 0 }}>{content}</View>
            <PinRelockOverlay />
            {showBottomTabBar ? <BottomTabBar /> : null}
          </View>
        </FlyToCartProvider>
      </CartSummaryProvider>
    </AccountDrawerProvider>
  );
}
