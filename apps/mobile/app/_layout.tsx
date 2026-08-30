import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Platform, Text, View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getAppVersion, type AppVersion } from "@double-a/api-client/queries";
import { PaperBackdrop } from "@/components/paper-backdrop";
import { PullProgressModal } from "@/components/pull-progress-modal";
import { UpdateDialog } from "@/components/update-dialog";
import { migrate } from "@/db";
import { APP_VERSION } from "@/lib/api/client";
import { getApiClient, isEnrolled } from "@/lib/api/session";
import { LocationScopeProvider } from "@/lib/location-scope";
import { registerDevicePushToken, watchForPushTokenChanges } from "@/lib/push";
import { SessionProvider } from "@/lib/session";
import { SyncProvider } from "@/sync/sync-provider";
import { getUpdateStatus } from "@/lib/version-check";
import { color, space, styles } from "@/theme";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- same asset-require pattern as setup.tsx/account-drawer.tsx; no *.png module declaration in this project
const LOGO = require("../assets/logo.png");

// Held up until migrate() below resolves, so the native launch image hands
// off straight into this screen's own LOGO — no gap where Expo's default
// splash graphic (or a blank frame) could flash in between.
void SplashScreen.preventAutoHideAsync();

/**
 * Backs admin-mode screens only (app/admin/**) — the POS screens stay on
 * local SQLite + the manual sync button, untouched. One client for the app's
 * lifetime is fine here (unlike apps/admin's per-request QueryClient): a
 * device has exactly one signed-in identity at a time, no cross-user cache
 * bleed to worry about.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<AppVersion | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  // The local database is created on first launch, before anything can read it.
  useEffect(() => {
    migrate()
      .then(() => setReady(true))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Could not open the database"),
      )
      .finally(() => void SplashScreen.hideAsync());
  }, []);

  // Checked before (or without) any login, so a force-update dialog can
  // block even at the boot/setup screens — not just once fully unlocked.
  // Android only, per this app's own release channel; best-effort (a failed
  // check never blocks the app, only a confirmed old build does).
  useEffect(() => {
    if (Platform.OS !== "android") return;
    getAppVersion(getApiClient())
      .then(setAppVersion)
      .catch(() => undefined);
  }, []);

  const updateStatus = appVersion
    ? getUpdateStatus(APP_VERSION, appVersion.minVersion, appVersion.latestVersion)
    : "none";
  const showUpdateDialog = updateStatus === "force" || (updateStatus === "optional" && !updateDismissed);

  // Once per boot, and only actually calls the API if the token changed —
  // see lib/push.ts. Skipped entirely until setup.tsx has this terminal
  // signed in; registering before that has no session to attach the token to.
  useEffect(() => {
    if (!ready) return;
    let unsubscribe: (() => void) | undefined;

    void isEnrolled().then((enrolled) => {
      if (!enrolled) return;
      void registerDevicePushToken();
      unsubscribe = watchForPushTokenChanges();
    });

    return () => unsubscribe?.();
  }, [ready]);

  if (error) {
    return (
      <>
        <View style={[styles.screen, { justifyContent: "center", padding: space.xl }]}>
          <PaperBackdrop />
          <Image
            source={LOGO}
            style={{ width: 72, height: 72, alignSelf: "center", marginBottom: space.lg }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.subheading}>This terminal could not start</Text>
          <Text style={[styles.muted, { marginTop: space.sm }]}>{error}</Text>
        </View>
        {showUpdateDialog ? (
          <UpdateDialog
            status={updateStatus}
            version={appVersion}
            onDismiss={() => setUpdateDismissed(true)}
          />
        ) : null}
      </>
    );
  }

  if (!ready) {
    return (
      <>
        <View style={[styles.screen, { justifyContent: "center", alignItems: "center" }]}>
          <PaperBackdrop />
          <Image
            source={LOGO}
            style={{ width: 96, height: 96, marginBottom: space.xl }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <ActivityIndicator color={color.primary} />
        </View>
        {showUpdateDialog ? (
          <UpdateDialog
            status={updateStatus}
            version={appVersion}
            onDismiss={() => setUpdateDismissed(true)}
          />
        ) : null}
      </>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <SyncProvider>
              <LocationScopeProvider>
                <StatusBar style="dark" />
                <View style={{ flex: 1, backgroundColor: color.paper }}>
                  <PaperBackdrop />
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { flex: 1, backgroundColor: "transparent" },
                      // Boot/unlock/setup swap via router.replace(), same reasoning as
                      // the POS tab stack: fade instead of a directional slide.
                      animation: "fade",
                      animationDuration: 180,
                    }}
                  />
                </View>
                <PullProgressModal />
                {showUpdateDialog ? (
                  <UpdateDialog
                    status={updateStatus}
                    version={appVersion}
                    onDismiss={() => setUpdateDismissed(true)}
                  />
                ) : null}
              </LocationScopeProvider>
            </SyncProvider>
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
