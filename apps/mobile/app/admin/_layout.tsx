import { useEffect, useState } from "react";
import { Redirect, Stack, useRouter } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { useLocationScope } from "@/lib/location-scope";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { useIdleLock } from "@/lib/idle-lock";
import { ensureFreshSession } from "@/lib/api/session";
import { Button } from "@/components/ui";
import { LoadingState } from "@/components/loading-state";
import { color, fontSize, space, styles } from "@/theme";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- same asset-require pattern as setup.tsx; no *.png module declaration in this project
const LOGO = require("../../assets/logo.png");

type SessionCheck = "checking" | "ready" | "error";

/**
 * Admin mode: web dashboard in a WebView at /admin (default), with native
 * screens kept aside under /admin/native and /admin/*. Online-only — same as
 * apps/admin (CLAUDE.md §5).
 */
export default function AdminLayout() {
  const { cashier } = useSession();
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
    enrolledRole === "admin" || cashier?.role === "admin" || cashier?.role === "manager";

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

  if (check === "checking") {
    return <LoadingState text="Opening admin dashboard…" />;
  }

  if (check === "error") {
    return (
      <View
        style={[
          styles.screen,
          { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md },
        ]}
      >
        <Text style={styles.subheading}>Could not open the admin dashboard</Text>
        <Text style={[styles.muted, { textAlign: "center" }]}>{error}</Text>
        <Button label="Back to POS" onPress={() => router.replace("/pos")} />
      </View>
    );
  }

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      // Catches taps on the header row and any native (non-WebView) screen
      // under here. A tap inside the WebView itself (app/admin/index.tsx)
      // does not bubble to RN's touch responder system, so it can't reset
      // this clock — background/foreground locking (AppState, see
      // lib/idle-lock.ts) still fires regardless and is the part that matters
      // most for "walked away with the dashboard open."
      onTouchStart={recordActivity}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
          backgroundColor: color.primary,
        }}
      >
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/pos"))}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.tapTarget}
        >
          <ArrowLeft size={20} color={color.onPrimary} strokeWidth={2} />
        </Pressable>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: color.surface,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <Image source={LOGO} style={{ width: 20, height: 20 }} resizeMode="contain" />
        </View>
        <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.onPrimary }}>
          Admin dashboard
        </Text>
      </View>

      <View style={{ flex: 1, minHeight: 0 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
      </View>
    </View>
  );
}
