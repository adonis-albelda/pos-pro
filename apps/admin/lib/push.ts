"use client";

import { useEffect } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { registerPushToken } from "@double-a/api-client/queries";
import { firebaseMessaging, isFirebaseConfigured } from "@/lib/firebase";
import { getBrowserApiClient } from "@/lib/api/browser-client";

const LAST_REGISTERED_KEY = "double-a.fcm-token-registered";

/** localStorage's own record of the last token value the API accepted — the only thing that decides whether the API gets called. */
async function registerIfChanged(token: string): Promise<void> {
  const lastRegistered = localStorage.getItem(LAST_REGISTERED_KEY);
  if (token === lastRegistered) return;

  await registerPushToken(getBrowserApiClient(), token, "web");
  localStorage.setItem(LAST_REGISTERED_KEY, token);
}

/**
 * Mounted once, in the dashboard shell — asks for notification permission on
 * first run only (the browser itself remembers the decision after that),
 * and only calls the API when the token differs from what localStorage
 * already has on file, same "not every page load" rule as the mobile side.
 * A no-op everywhere isFirebaseConfigured() is false, so a shop that hasn't
 * set up Firebase yet sees nothing broken, just no push notifications.
 */
export function usePushNotifications(): void {
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      return;
    }

    let unsubscribeForeground: (() => void) | undefined;

    void (async () => {
      try {
        let permission = Notification.permission;
        if (permission === "default") {
          permission = await Notification.requestPermission();
        }
        if (permission !== "granted") return;

        const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
        const token = await getToken(firebaseMessaging(), {
          vapidKey,
          serviceWorkerRegistration: registration,
        });
        if (token) await registerIfChanged(token);

        // Foreground messages (tab open and focused) never reach the
        // service worker — this is the only place they're seen at all.
        unsubscribeForeground = onMessage(firebaseMessaging(), (payload) => {
          const title = payload.notification?.title ?? "POSPro";
          const body = payload.notification?.body;
          if (Notification.permission === "granted") {
            new Notification(title, { body });
          }
        });
      } catch (error) {
        // Best-effort — the dashboard works fine without push notifications.
        console.error("push notification setup failed", error);
      }
    })();

    return () => unsubscribeForeground?.();
  }, []);
}
