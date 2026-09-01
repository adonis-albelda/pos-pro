import { useMemo, useRef, useState, type ForwardRefExoticComponent, type RefAttributes } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import RNWebView from "react-native-webview";
import type {
  AndroidWebViewProps,
  IOSWebViewProps,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
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
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui";
import { LoadingState } from "@/components/loading-state";
import { color, space, styles } from "@/theme";

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
        <Text style={styles.subheading}>Could not load admin dashboard</Text>
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
      {!ready ? <LoadingState text="Opening admin dashboard…" /> : null}
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
            description ? `${description} (${url || dashboardUrl})` : "Could not reach the admin dashboard.",
          );
        }}
        style={{ flex: 1, opacity: ready ? 1 : 0 }}
      />
    </View>
  );
}
