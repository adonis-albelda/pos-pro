import { useMemo, useRef, useState, type ForwardRefExoticComponent, type RefAttributes } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import RNWebView from "react-native-webview";
import type {
  AndroidWebViewProps,
  IOSWebViewProps,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewNavigation,
  WindowsWebViewProps,
} from "react-native-webview/lib/WebViewTypes";
import {
  adminWebDashboardUrl,
  adminWebUrl,
  isAllowedAdminWebUrl,
} from "@/lib/admin-web-url";
import { buildAdminBootstrapHtml } from "@/lib/admin-web-cookies";
import { getAdminToken, getAdminTokenExpiresAt } from "@/lib/api/session";
import { useIdleActivity } from "@/lib/idle-lock";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui";
import { color, space, styles } from "@/theme";

/** WebView → RN idle ping. Kept short so postMessage spam stays cheap. */
const IDLE_ACTIVITY_MESSAGE = "idle-activity";

/**
 * Touch/scroll inside the dashboard never reaches the admin layout's
 * onTouchStart — inject listeners that ping the idle clock instead.
 * Re-run on every SPA navigation (SPA pages replace document).
 */
const IDLE_ACTIVITY_SCRIPT = `
(function () {
  if (window.__doubleAIdleArmed) return true;
  window.__doubleAIdleArmed = true;
  var last = 0;
  function ping() {
    var now = Date.now();
    if (now - last < 1000) return;
    last = now;
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage("${IDLE_ACTIVITY_MESSAGE}");
    }
  }
  document.addEventListener("touchstart", ping, { passive: true, capture: true });
  document.addEventListener("mousedown", ping, { passive: true, capture: true });
  document.addEventListener("scroll", ping, { passive: true, capture: true });
  document.addEventListener("keydown", ping, { passive: true, capture: true });
  true;
})();
`;

type AdminWebViewRef = {
  stopLoading: () => void;
};

type AdminWebViewProps = IOSWebViewProps & AndroidWebViewProps & WindowsWebViewProps;

const WebView = RNWebView as unknown as ForwardRefExoticComponent<
  AdminWebViewProps & RefAttributes<AdminWebViewRef>
>;

/**
 * Admin dashboard WebView. Same-origin bootstrap HTML seeds cookies in JS,
 * then redirects — works on Android without native cookie modules.
 */
export function AdminWebView() {
  const router = useRouter();
  const webRef = useRef<AdminWebViewRef>(null);
  const recordActivity = useIdleActivity();
  const { cashier } = useSession();
  const isDemo = cashier?.isDemo ?? false;
  const adminOrigin = adminWebUrl(isDemo);
  const dashboardUrl = adminWebDashboardUrl(isDemo);
  const token = getAdminToken();
  const expiresAt = getAdminTokenExpiresAt();

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const webSource = useMemo(() => {
    if (!token) return undefined;
    return {
      html: buildAdminBootstrapHtml(token, expiresAt, dashboardUrl),
      baseUrl: `${adminOrigin}/`,
    };
  }, [token, expiresAt, dashboardUrl, adminOrigin, attempt]);

  function guardNavigation(url: string): boolean {
    return isAllowedAdminWebUrl(url, adminOrigin);
  }

  function onNavigationChange(nav: WebViewNavigation) {
    if (!guardNavigation(nav.url)) {
      webRef.current?.stopLoading();
      return;
    }
    if (nav.url.includes("/login") && nav.loading === false) {
      setError("Admin session was not accepted. Unlock again with an admin PIN.");
    }
  }

  function onMessage(event: WebViewMessageEvent) {
    if (event.nativeEvent.data === IDLE_ACTIVITY_MESSAGE) {
      recordActivity();
    }
  }

  if (!token) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: space.xl,
          gap: space.md,
        }}
      >
        <Text style={styles.subheading}>Admin sign-in required</Text>
        <Text style={[styles.muted, { textAlign: "center" }]}>
          Unlock with an admin PIN to open the web dashboard. Manager-only unlock cannot start a web
          session.
        </Text>
        <Button label="Back to POS" onPress={() => router.replace("/pos")} />
        <Button
          label="Open legacy admin"
          variant="secondary"
          onPress={() => router.push("/admin/native")}
        />
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: space.xl,
          gap: space.md,
        }}
      >
        <Text style={styles.subheading}>Could not load Backoffice</Text>
        <Text style={[styles.muted, { textAlign: "center" }]}>{error}</Text>
        <Button
          label="Try again"
          onPress={() => {
            setReady(false);
            setError(null);
            setAttempt((value) => value + 1);
          }}
        />
        <Button label="Back to POS" variant="secondary" onPress={() => router.replace("/pos")} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      {/* Bare spinner, no text — admin/_layout.tsx already said "Opening
          Backoffice…" during the session check that ran before this
          component mounted, and the dashboard shows its own loading state
          moments after this one clears. A second identical sentence here
          just stacked redundant messaging in front of the cashier. */}
      {!ready ? (
        <View
          style={{
            ...StyleSheet.absoluteFill,
            zIndex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: color.surface,
          }}
        >
          <ActivityIndicator color={color.primary} />
        </View>
      ) : null}
      <WebView
        key={attempt}
        ref={webRef}
        source={webSource}
        incognito
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        cacheEnabled={false}
        setSupportMultipleWindows={false}
        pullToRefreshEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={["https://*", "about:blank"]}
        onShouldStartLoadWithRequest={(request: WebViewNavigation) => guardNavigation(request.url)}
        onNavigationStateChange={onNavigationChange}
        onLoadEnd={() => setReady(true)}
        onMessage={onMessage}
        injectedJavaScript={IDLE_ACTIVITY_SCRIPT}
        injectedJavaScriptBeforeContentLoaded={IDLE_ACTIVITY_SCRIPT}
        onHttpError={(event: WebViewHttpErrorEvent) => {
          const { statusCode, url } = event.nativeEvent;
          if (statusCode >= 400 && guardNavigation(url)) {
            setError(`Server returned ${statusCode} for ${url}`);
          }
        }}
        onError={(event: WebViewErrorEvent) => {
          const { description, url } = event.nativeEvent;
          if (url && !guardNavigation(url)) return;
          setError(
            description ? `${description} (${url || dashboardUrl})` : "Could not reach Backoffice.",
          );
        }}
        style={{ flex: 1, opacity: ready ? 1 : 0 }}
      />
    </View>
  );
}
