/**
 * Serves the Firebase Messaging service worker at the origin root
 * (/firebase-messaging-sw.js — Firebase's own hardcoded default lookup path,
 * hence the literal folder name here rather than app/sw/route.ts). A route
 * handler instead of a static file in public/ because the config below has
 * to be the same NEXT_PUBLIC_FIREBASE_* values lib/firebase.ts uses, and a
 * static file can't read process.env at request time.
 *
 * This only handles BACKGROUND messages (tab not focused/closed) —
 * lib/push.ts's onMessage() listener handles foreground ones, which never
 * reach a service worker at all.
 */
export function GET(): Response {
  const body = `
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "${process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? ""}",
  authDomain: "${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? ""}",
  projectId: "${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ""}",
  storageBucket: "${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? ""}",
  messagingSenderId: "${process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? ""}",
  appId: "${process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? ""}",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? "POSPro One";
  const body = payload.notification?.body ?? "";
  self.registration.showNotification(title, { body, icon: "/icon.png" });
});
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
