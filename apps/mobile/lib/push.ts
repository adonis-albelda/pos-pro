import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { registerPushToken, type PushPlatform } from "@double-a/api-client/queries";
import { getApiClient } from "@/lib/api/session";

const LAST_REGISTERED_KEY = "double-a.fcm-token-registered";

// Module-level, not inside a component: without this, a notification
// arriving while the terminal is in the foreground is received but never
// displayed — expo-notifications doesn't show anything unless the app
// explicitly opts in, same distinction as the web side's onMessage handler.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function nativePlatform(): PushPlatform {
  return Platform.OS === "ios" ? "ios" : "android";
}

/** SecureStore's own record of the last token value the API actually accepted — the only thing that decides whether the API gets called. */
async function registerIfChanged(token: string): Promise<void> {
  const lastRegistered = await SecureStore.getItemAsync(LAST_REGISTERED_KEY);
  if (token === lastRegistered) return;

  await registerPushToken(getApiClient(), token, nativePlatform());
  await SecureStore.setItemAsync(LAST_REGISTERED_KEY, token);
}

/**
 * Called once per app boot (app/_layout.tsx), after the terminal is
 * confirmed set up. Asks for permission on first run only — expo-notifications
 * remembers the OS decision — and only calls the API when the token it gets
 * back differs from what SecureStore already has on file, so a terminal
 * left running for months doesn't re-PUT the same token every launch.
 */
export async function registerDevicePushToken(): Promise<void> {
  try {
    if (Platform.OS === "android") {
      // Required on API 26+ — without a channel, the OS silently drops the
      // notification regardless of foreground/background state or the
      // handler above.
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== "granted") return;

    const { data: token } = await Notifications.getDevicePushTokenAsync();
    await registerIfChanged(token);
  } catch (error) {
    // Best-effort — a terminal with no push token still sells fine.
    console.error("push token registration failed", error);
  }
}

/**
 * Rare (the OS rotating a token underneath a running app), but the API has
 * to hear about it when it happens. Call once, keep the returned unsubscribe
 * for the component's lifetime.
 */
export function watchForPushTokenChanges(): () => void {
  const subscription = Notifications.addPushTokenListener((deviceToken) => {
    if (typeof deviceToken.data !== "string") return; // web-shaped token, not expected on native
    void registerIfChanged(deviceToken.data).catch(() => {
      // Best-effort.
    });
  });

  return () => subscription.remove();
}
