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

type AdminWebViewRef = {
  stopLoading: () => void;
};

type AdminWebViewProps = IOSWebViewProps & AndroidWebViewProps & WindowsWebViewProps;

const WebView = RNWebView as unknown as ForwardRefExoticComponent<
  AdminWebViewProps & RefAttributes<AdminWebViewRef>
>;
import {
  adminWebDashboardUrl,
  adminWebUrl,
  isAllowedAdminWebUrl,
} from "@/lib/admin-web-url";
import {
  buildAdminEmbedCookieScript,
  buildAdminSessionCookieHeader,
} from "@/lib/admin-web-cookies";
import { getAdminToken, getAdminTokenExpiresAt } from "@/lib/api/session";
import { Button } from "@/components/ui";
import { LoadingState } from "@/components/loading-state";
import { color, fontSize, space, styles } from "@/theme";

/**
 * Full admin dashboard in a locked-down WebView. Session cookies are injected
 * before first paint on /auth/embed — no token in the URL. incognito clears
 * the jar when this unmounts (shift lock / leave admin).
 */
export function AdminWebView() {
  const router = useRouter();
  const webRef = useRef<AdminWebViewRef>(null);
  const adminOrigin = adminWebUrl();
  const dashboardUrl = adminWebDashboardUrl();
  const token = getAdminToken();
  const expiresAt = getAdminTokenExpiresAt();

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const webSource = useMemo(() => {
    if (!token) return undefined;
    return {
      uri: dashboardUrl,
      headers: { Cookie: buildAdminSessionCookieHeader(token, expiresAt) },
    };
  }, [token, expiresAt, dashboardUrl, attempt]);

  const injectedBeforeContentLoaded = useMemo(() => {
    if (!token) return undefined;
    return buildAdminEmbedCookieScript(token, expiresAt);
  }, [token, expiresAt]);

  function guardNavigation(url: string): boolean {
    return isAllowedAdminWebUrl(url, adminOrigin);
  }

  function onNavigationChange(nav: WebViewNavigation) {
    if (!guardNavigation(nav.url)) {
      webRef.current?.stopLoading();
      return;
    }
    if (nav.url.includes("/login")) {
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
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={["https://*"]}
        injectedJavaScriptBeforeContentLoaded={injectedBeforeContentLoaded}
        onShouldStartLoadWithRequest={(request: WebViewNavigation) => guardNavigation(request.url)}
        onNavigationStateChange={onNavigationChange}
        onLoadEnd={() => setReady(true)}
        onHttpError={(event: WebViewHttpErrorEvent) => {
          const { statusCode, url } = event.nativeEvent;
          if (statusCode >= 400) {
            setError(`Server returned ${statusCode} for ${url}`);
          }
        }}
        onError={(event: WebViewErrorEvent) => {
          const { description, url } = event.nativeEvent;
          setError(description ? `${description} (${url})` : "Could not reach the admin dashboard.");
        }}
        style={{ flex: 1, opacity: ready ? 1 : 0 }}
      />
    </View>
  );
}
